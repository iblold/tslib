/******************************************************
 * @Description: 
 * @Date: 2018-12-16 12:45:02
 * @Author: iblold@gmail.com
 * @LastEditTime: 2018-12-16 20:01:39
 *******************************************************/
 import * as crypto from 'crypto';
 import * as fs from 'fs';
 import * as path from 'path';

/**
 * NspInterpreter 类
 */
export class NspInterpreter {

    m_nsps: any;
    m_host: any;

    constructor(host: any) {
        this.m_nsps = {};
        this.m_host = host;
        (<any>global).report_this_function = null;
    }

    // 获取文件名md5值
    getFuncName(file: string) {
        let md5sum = crypto.createHash('md5');
        md5sum.update(file);
        return 'f_' + md5sum.digest('hex');
    }

    // 翻译nsp为js源码
    parse(file: string, cb: any) {
        fs.exists(file, (exists) => {
            if (exists) {

                fs.readFile(file, (err, data) => {
                    if (!err) {
                        // 调用结束回调
                        let endfunc = "";
                        // 替换单斜杠为双斜杠，避免变成源码后被转义
                        let filestr = data.toString();//.replace("\\", "\\\\");

                        // 转换<%=...%>形式为<% response.write(...); %>
                        let rwBuff = filestr.match(/(<%=[\w\s"'\(\)\+\-\*\/\^&|\?\.\{\}\[\]\\\t\r\n><%=;,:]*?%>)/g);
                        if (rwBuff) {
                            for (let i = 0; i < rwBuff.length; ++i) {
                                let rwParam: any = rwBuff[i].match(/<%=([\w\s"'\(\)\+\-\*\/\^&|\?\.\{\}\[\]\\\t\r\n><%=;,:]*?)%>/);
                                filestr = filestr.replace(rwParam[0], "<% response.write(" + rwParam[1] + "); %>");
                            }
                        }

                        let fname = this.getFuncName(file);

                        let head = "function " + fname + "(request, response, pageEnd){\n";

                        if (filestr.indexOf("pageEnd(") < 0 && filestr.indexOf("response.end") < 0) {
                            endfunc = "pageEnd(null, null);";
                        }

                        let source = "";
                        let finish = false;
                        let offset = 0;
                        let strs = [];
                        // 转换所有<% %>为代码形式
                        while (!finish) {
                            
                            let spos = filestr.indexOf("<%", offset);
                            if (spos >= 0) {
                                let epos = filestr.indexOf("%>", spos);
                                if (epos >= 0) {
                                    // <%%>之外的内容作为字符串，用`括起并放到文件之前定义
                                    // 运行时直接用response输出
                                    let str = filestr.substring(offset, spos);
                                    if (str.length > 0) {
                                        source += ("response.write(str_" + strs.length + ");\n");
                                        strs.push(str);
                                    }

                                    // <%...%>中间的内容作为代码原样使用
                                    source += filestr.substring(spos + 2, epos);
                                    source += "\n";
                                    offset = epos + 2;

                                } else {
                                    cb("<% has no %> at:" + file + ":" + spos);
                                }
                            } else {
                                finish = true;
                                // 结尾内容，全是字符串
                                let str = filestr.substring(offset);
                                if (str.length > 0) {
                                    source += ("response.write(str_" + strs.length + ");\n");
                                    strs.push(str);
                                }
                            }
                        }

                        let strdef = "";
                        for (let i = 0; i < strs.length; ++i) {
                            strdef += ("let str_" + i + " = `");
                            strdef += strs[i].replace("${", "\${"); // 使用模板字符串，${会形成替换字符，转义掉
                            strdef += "`;\n";
                        }

                        cb(null, head + strdef + source
                            + endfunc + "};\nreport_this_function("
                            + fname + ");");

                    } else {
                        cb(err);
                    }
                });

            } else {
                cb("no such file: " + file);
            }
        });
    }
	
	isNsp(filePath: string){
		let ext = path.extname(filePath);
		return ext == '.nsp' || ext == '.nss';
	}

    compile(file: string, cb: any) {
        file = path.resolve(file);
        // 先获取文件状态
        fs.lstat(file, (err, stats) => {
            if (!err) {
                let ext = path.extname(file);
				if (ext == '.nsp'){
					// 翻译文件
                    this.parse(file, (err: any, result: any) => {
						if (!err) {
							try {
							   // 记录eval编译的结果
								(<any>global).report_this_function = (f: any) => {
                                    this.m_nsps[file] = { "func": f.bind(this), "stats": stats};
								}
								// 编译
								eval(result);

                                let fst = this.m_nsps[file];
								cb(fst.func ? null : file + " compile failed.", fst.func);
							} catch (e) {
								cb([file + ":" + e, result]);
							}
						} else {
							cb(err);
						}
					});
				} else if (ext == '.nss'){
					try{
                        let f = require(file);
                        this.m_nsps[file] = { "func": f.sub.bind(this), "stats": stats };
						cb(null, f.sub);
					}catch(e){
						cb(e);
					}
				}
            } else {
                cb(err);
            }
        });
    }

    run(file: string, req: any = null, res: any = null, cb: any = null) {

        file = path.resolve(file);
        // 获取文件状态，决定是否重新编译
        fs.lstat(file, (err, stats) => {
            if (!err) {
                let fst = this.m_nsps[file];
                // 文件一致直接运行编译结果
                if (fst && fst.stats.mtime.getTime() >= stats.mtime.getTime()) {
                    fst.func(req, res, cb);
                } else {
                    // 重新编译并运行
                    this.compile(file, (err: any, func: any) => {
                        if (!err) {
                            func(req, res, cb);
                        } else {
                            cb(err);
                        }
                    });
                }
            } else {
                cb(err);
            }
        });
    }
}
