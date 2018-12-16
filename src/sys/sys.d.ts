/******************************************************
 * @Description: 
 * @Date: 2018-12-16 07:55:24
 * @Author: iblold@gmail.com
 * @LastEditTime: 2018-12-16 12:46:17
 *******************************************************/

/**
 * 记录错误日志, level <= LogLevel.LogError时记录
 * @param str 日志内容 
 */
declare function logErr(str: string): void;

/**
 * 记录错误日志, level <= LogLevel.logWran时记录
 * @param str 日志内容 
 */
declare function logWran(str: string): void;

/**
 * 记录错误日志, level <= LogLevel.LogInfo时记录
 * @param str 日志内容 
 */
declare function logInfo(str: string): void;

/**
 * 记录错误日志, level <= LogLevel.LogDebug时记录
 * @param str 日志内容 
 */
declare function logDeb(str: string): void;

/** 日志类单件 */
declare var logSingleton_: any;

/** 日志级别 */
interface LogLevel{
    LogError: number;
    LogWran: number;
    LogInfo: number;
    LogDebug: number;
}

/** 日志写入位置, 多个位置同时写入使用|来连接, 如LogConsole | LogInFile */ 
interface LogTarget{
    LogConsole: number;
    LogInFile: number;
    LogToServer: number;
}

/** 日志格式, 多种格式用|来连接, 如 LogColor | LogTime */ 
interface LogFormat{
    LogColor: number;
    LogSrcFile: number;
    LogTime: number;
}

/** 一般回调函数 */
type cbFunc = ()=>void;