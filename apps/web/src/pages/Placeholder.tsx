// 通用占位页：脚手架阶段用于验证路由挂载，后续替换为真实页面
export function Placeholder({ title }: { title: string }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-slate-500">页面骨架已挂载，业务实现待后续任务补全。</p>
    </section>
  );
}