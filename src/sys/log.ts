/******************************************************
 * @Description: 
 * @Date: 2018-12-15 20:56:32
 * @Author: iblold@gmail.com
 * @LastEditTime: 2018-12-17 00:16:08
 *******************************************************/

import * as fs from 'fs';
import {BaseFn} from './basefunc';
import {TerminalColor as Color} from './terminalcolor';
import * as path from 'path';
import * as request from 'request';

/** 日志级别 */
export class LogLevel{
    static LogError = 0;
    static LogWran = 1;
    static LogInfo = 2;
    static LogDebug = 3;
}

/** 日志写入位置, 多个位置同时写入使用|来连接, 如LogConsole | LogInFile */ 
export class LogTarget{
    static LogConsole: number = 1;
    static LogInFile: number = 2;
    static LogToServer: number = 4;
}

/** 日志格式, 多种格式用|来连接, 如 LogColor | LogTime */ 
export class LogFormat{
    static LogColor: number = 1;
    static LogSrcFile: number = 2;
    static LogTime: number = 4;
}

/** 日志类 */
export class Log{
    /**日志路径 */ 
    m_path: string;
    /** 允许记录的级别 */
    m_level: LogLevel;
    /** 记录位置 */
    m_target: number;
    /** 日志文件句柄 */
    m_fd: number;
    /** 日志格式 */
    m_format: number;
    /** 各级别日志的颜色 */
    m_color: any[];
    /** 各级别前缀 */
    m_levelStr: string[];
    /** 日志服务器地址, http post */
    m_url: string;

    /**
     * 日志类构造函数
     * @param path 日志路径, 默认当前目录log文件夹
     * @param level 允许记录的日志级别, 默认全部记录
     * @param target 日志位置, 默认记录到文件和控制台
     * @param fmt 日志格式, 默认输出时间\所在源文件\颜色
     * @param url 日志服务器地址, http post
     */
    constructor(path: string = '', level: LogLevel = LogLevel.LogDebug
        , target: number = 3, fmt: number = 7, url: string = ''){
        this.m_path = path == '' ? './log' : path;
        this.m_level = level;
        this.m_target = target;
        this.m_fd = 0;
        this.m_format = fmt;
        this.m_color = [
            Color.red, Color.yellow, Color.white, Color.green
        ];
        this.m_levelStr = ['[Error]', '[Warning]', '[Info]', '[Debug]'];
        this.m_url = url;

        process.on('exit', code=>{
            if(this.m_fd){
                fs.closeSync(this.m_fd);
            }
        });
    }

    /**
     * 写一条日志
     * @param level 本条日志级别
     * @param str 本条日志内容
     */
    write(level: LogLevel, str: string){

        // 有写入目的和合适级别的日志才被处理
        if (this.m_target > 0 && level <= this.m_level){

            str = this.m_levelStr[level] + str;

            // 需要记录日志所在行
            if ((this.m_format & LogFormat.LogSrcFile) != 0){
                let st = (<any>new Error()).stack.split('\n')[3];
                if (st) {
                    let tmp = st.match(/[\s\S]*\(([\s\S]*)\)/) || st.match(/\s*at\s*([\s\S]*)\s*/);
                    if(tmp){
                        str = '(' + path.basename(tmp[1] ? tmp[1] : '') + '): ' + str; 
                    }
                }
            }

            // 需要记录时间
            if ((this.m_format & LogFormat.LogTime) != 0){
                str = '[' + BaseFn.getTimeString('yy-m-d h:i:s') + ']' + str;
            }

            // 控制台输出
            if ((this.m_target & LogTarget.LogConsole) != 0){
                if((this.m_format & LogFormat.LogColor) != 0){
                    console.log(this.m_color[level](str));
                } else {
                    console.log(str);
                }   
            }

            // 写入文件
            if ((this.m_target & LogTarget.LogInFile) != 0){

                if (this.m_fd == 0){
                    let fname = BaseFn.getTimeString('yyyymmddhhiiss') + '.log';
                    BaseFn.mkdir(this.m_path);
                    fs.open(this.m_path + '/' + fname, 'a', (err, fd)=>{
                        if (!err){
                            this.m_fd = fd;
                            fs.write(fd, str, err=>{
                                if (err){
                                    console.log(Color.red(err.message + '[Error] write log file failed!'));
                                    this.m_fd = 0;
                                }
                            });
                        } else {
                            console.log(Color.red(err.message + '[Error] create log file failed!'));
                        }
                    });
                } else {
                    fs.write(this.m_fd, str, err=>{
                        if (err){
                            console.log(Color.red(err.message + '[Error] write log file failed!'));
                            this.m_fd = 0;
                        }
                    });
                }

            }

            // 写到服务器
            if((this.m_target & LogTarget.LogToServer) != 0 && this.m_url != ''){
                request.post({
                    url: this.m_url,
                    body:{
                        log: str
                    },
                    json: true
                }, (err, res, body)=>{
                    if(err){
                        console.log(Color.red(err.message + '[Error] write to log server failed! \n'));
                    }
                });
            }
        }
    }

    /**
     * 创建日志类单件, 之后可以使用 logErr(), logWran(), logInfo(), logDeb()来记录日志
     * @param path 日志路径, 默认当前目录log文件夹
     * @param level 允许记录的日志级别, 默认全部记录
     * @param target 日志位置, 默认记录到文件和控制台
     * @param fmt 日志格式, 默认输出时间\所在源文件\颜色
     * @param url 日志服务器地址, http post
     */
    static createSingleton(path: string = '', level: LogLevel = LogLevel.LogDebug, target: number = LogTarget.LogConsole | LogTarget.LogInFile, 
        fmt: number = LogFormat.LogColor | LogFormat.LogSrcFile | LogFormat.LogTime, url: string = ''){

        if((<any>global).logSingleton_ == null){
            (<any>global).logSingleton_ = new Log(path, level, target, fmt, url);
        }

        (<any>global).logErr = function(str: string){
            logSingleton_.write(LogLevel.LogError, str);
        };

        (<any>global).logWran = function(str: string){
            logSingleton_.write(LogLevel.LogWran, str);
        };

        (<any>global).logInfo = function(str: string){
            logSingleton_.write(LogLevel.LogInfo, str);
        };

        (<any>global).logDeb = function(str: string){
            logSingleton_.write(LogLevel.LogDebug, str);
        };
    }
}
