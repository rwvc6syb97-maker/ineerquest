import asyncio
import os
import json
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn

from oxygent import MAS, Config, oxy, preset_tools

app = FastAPI(title="InnerQuest OxyGent Service", version="1.0.0")

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    trace_id: Optional[str] = None
    caller_id: Optional[str] = None
    scene: Optional[str] = "ai-chat"

class ChatResponse(BaseModel):
    text: str
    degraded: bool = False
    degrade_reason: Optional[str] = None

mas_instance: Optional[MAS] = None

def setup_oxy_space():
    Config.set_agent_llm_model("default_llm")
    
    api_key = os.getenv("DEFAULT_LLM_API_KEY", "")
    base_url = os.getenv("DEFAULT_LLM_BASE_URL", "")
    model_name = os.getenv("DEFAULT_LLM_MODEL_NAME", "deepseek-chat")
    
    if not api_key or not base_url:
        raise RuntimeError("DEFAULT_LLM_API_KEY and DEFAULT_LLM_BASE_URL must be set")
    
    oxy_space = [
        oxy.HttpLLM(
            name="default_llm",
            api_key=api_key,
            base_url=base_url,
            model_name=model_name,
        ),
        preset_tools.time_tools,
        oxy.ReActAgent(
            name="time_agent",
            desc="A tool that can query the current time",
            tools=["time_tools"],
        ),
        preset_tools.math_tools,
        oxy.ReActAgent(
            name="math_agent",
            desc="A tool that can perform mathematical calculations",
            tools=["math_tools"],
        ),
        oxy.ReActAgent(
            is_master=True,
            name="master_agent",
            sub_agents=["time_agent", "math_agent"],
            desc="Master agent that coordinates other agents for comprehensive responses",
        ),
    ]
    
    return oxy_space

@app.on_event("startup")
async def startup_event():
    global mas_instance
    try:
        oxy_space = setup_oxy_space()
        mas_instance = MAS(oxy_space=oxy_space)
        await mas_instance.start()
        print("OxyGent MAS service started successfully")
    except Exception as e:
        print(f"Failed to start OxyGent service: {e}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    global mas_instance
    if mas_instance:
        await mas_instance.stop()
        print("OxyGent MAS service stopped")

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not mas_instance:
        raise HTTPException(status_code=500, detail="OxyGent service not initialized")
    
    try:
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
        result = await mas_instance.chat(messages)
        
        return ChatResponse(
            text=result,
            degraded=False,
        )
    except Exception as e:
        print(f"Chat error: {e}")
        return ChatResponse(
            text="AI service temporarily unavailable. Please try again later.",
            degraded=True,
            degrade_reason=str(e),
        )

async def chat_stream_generator(request: ChatRequest):
    if not mas_instance:
        yield f"data: {json.dumps({'delta': 'AI service not available', 'done': True, 'degraded': True})}\n\n"
        return
    
    try:
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
        async for chunk in mas_instance.chat_stream(messages):
            yield f"data: {json.dumps({'delta': chunk, 'done': False})}\n\n"
        yield f"data: {json.dumps({'delta': '', 'done': True})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'delta': 'AI service error', 'done': True, 'degraded': True, 'degrade_reason': str(e)})}\n\n"

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    return StreamingResponse(
        chat_stream_generator(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "oxygent", "available": mas_instance is not None}

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
