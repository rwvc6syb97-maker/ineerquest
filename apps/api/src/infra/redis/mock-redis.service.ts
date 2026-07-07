/**
 * 已废弃：Redis/MockRedis 已被 MySQL(cache_kv / cache_zset) 持久化实现完全替代。
 * 缓存 / 限流 / 配额 / 分布式锁请统一使用 RedisService（底层为 MysqlKvClient）。
 */
export {};