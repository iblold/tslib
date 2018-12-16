/******************************************************
 * @Description: 
 * @Date: 2018-12-16 12:44:39
 * @Author: iblold@gmail.com
 * @LastEditTime: 2018-12-16 20:00:45
 * 
 * config文件
    {
        "port": 80, 		// 端口号
        "root": "wwwroot",	// web根目录

        "schedule": "main.nss",     // 驻留脚本
        "https": false, 	//是否启用https
        "httpsKey": null,
        "httpsCert": null,
        
        "client_cache_first": false, 	// 优先使用浏览器缓存
        "server_filecache": false,		// 开启服务器文件缓存
        "cache_file_max": _MB(5),		// 服务器文件缓存最大限制
        
        "dir_visit": false, 	// 是否启用目录浏览
        
        "upload_limit": _MB(5), // 最大上传文件大小
        
        "compress": true, 		// 是否开启静态页面压缩传输
        "comp_ignores":[		// 要排除在压缩传输之外的文件格式
            ".png",
            ".jpg",
            ".apk",
            ".app",
            ".webp",
            ".gif",
            ".zip",
            ".rar",
            ".gz",
            ".tar"
        ],
        
        "default_page": [   // 目录下默认文件名
            "index.html",
            "index.htm",
            "index.nsp",
            "default.html",
            "default.htm",
            "default.nsp"
        ],

        "mime": {       		// 文件格式
            "nsp": "text/html",
            "html": "text/html",
            "js": "text/javascript",
            "css": "text/css",
            "gif": "image/gif",
            "jpg": "image/jpeg",
            "png": "image/png",
            "ico": "image/icon",
            "txt": "text/plain",
            "json": "application/json",
            "default": "application/octet-stream"
        }
    }
 *******************************************************/
import * as http from 'http';
import * as https from 'https';
import * as url from 'url';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { NspInterpreter } from './nspinterpreter';
import { BaseFn } from './basefunc';

export class HYHttpServer {
    m_config: any;
    
    // nps脚本解释器
    m_nsp: NspInterpreter = new NspInterpreter(this);

    m_routers: any;

    m_svrFileCache: any;

    constructor() {
        this.m_config = null;
        // 路由表
        this.m_routers = [];
        // 服务器文件缓存
        this.m_svrFileCache = { cacheSize: 0 };
    }

    init(configFile: string) {
        this.m_config = eval('(' + fs.readFileSync(path.normalize(configFile)) + ')');
        if (this.m_config) {
            return true;
        } else {
            return false;
        }
    }

    start(cb: any) {
        let port = this.m_config.port;
        let rootPath = this.m_config.root;

        // 扫描所有nsp文件并编译
        let nps:any = BaseFn.enumFiles(rootPath, /\.nsp$|\.nss$/);

        if (nps.length > 0) {
            for (let i = 0; i < nps.length; ++i) {
                let end = (i == nps.length - 1);
                let f = nps[i];
                this.m_nsp.compile(f, (err: any, func: any) => {
                    if (err) {
                        logErr("compile nsp file failed, error like this: ");
                        fs.writeFileSync(process.cwd() + "/errfile.js", err[1]);

                        require(process.cwd() + "/errfile.js");

                        if (cb) cb(err);
                    } else {
                        if (this.m_config.schedule && f == path.resolve(path.join(this.m_config.root, this.m_config.schedule))) {
                            this.m_nsp.run(f);
                        }
                    }
                    if (end) {
                        this.listen(port, cb);
                    }
                });
            }
        } else {
            this.listen(port, cb);
        }
    }

    listen(port: number, cb: any) {
        let operation = null;
		let httpServer = null;
		if (this.m_config.https){
			operation = {
				key: fs.readFileSync(this.m_config.httpsKey), //'test/fixtures/keys/agent2-key.pem'),
				cert: fs.readFileSync(this.m_config.httpsCert) //'test/fixtures/keys/agent2-cert.pem')
			};
			httpServer = https.createServer(operation, this.processRequest.bind(this));
		} else {
			//创建一个服务
			httpServer = http.createServer(this.processRequest.bind(this));
		}

        httpServer.on("error", error=>{
            logErr(error);
            if (cb) cb(error);
        });

        //在指定的端口监听服务
        httpServer.listen(port, ()=> {
            logInfo("HYHttpServer is running on " + port);
            if (cb) cb();
        });
    }

    // 获取服务器缓存文件
    fileFromCache(path: string, zip: any) {
        let fc = this.m_svrFileCache[path];
        let ret = null;
        if (fc) {
            if (!zip) {
                return fc.data;
            } else if (zip == 'gz' && fc.gz) {
                return fc.gz;
            } else if (zip == 'dz' && fc.dz) {
                return fc.dz;
            }
        } else {
            let fb = fs.readFileSync(path);
            if (fb) {
                fc = { data: fb };
                this.m_svrFileCache[path] = fc;
                this.m_svrFileCache.cacheSize += fb.length;
                ret = fb;
            }
        }

        if (zip == 'gz') {
            if (!fc.gz) {
                fc.gz = zlib.gzipSync(fc.data);
                this.m_svrFileCache.cacheSize += fc.gz.length;
            }

            ret = fc.gz;
        } else if (zip == 'dz') {
            if (!fc.dz) {
                fc.dz = zlib.deflateSync(fc.data);
                this.m_svrFileCache.cacheSize += fc.dz.length;
            }

            ret = fc.dz;
        }

        return ret;
    }

    // 解析form-multi-part
    parseMultipart(data: any, boundary: any) {

        let SEARCH_BOUNDARY_LINE = 0;
        let SEARCH_DISPOSITION_LINE = 1;
        let SEARCH_TYPE_LINE = 2;
        let SEARCH_SPLIT_LINE = 3;
        let SEARCH_DATA_LINE = 4;

        let offset = 0;
        let state = SEARCH_BOUNDARY_LINE;
        let curName = null;
        let curType = null;
        let curFilename = null;
        let curDisposition = null;
        let curDataStart = 0;

        let ret = [];
        let size = data.length - 1;
        for (let i = 0; i < size; ++i) {
            let f = data.readUInt16LE(i);
            // 找到换行
            if (f == 0xa0d) {
                let tmp = data.slice(offset, i);
                if (state == SEARCH_BOUNDARY_LINE) {
                    // 找到最初的boundary
                    let bstr = tmp.toString();
                    if (bstr.indexOf(boundary) >= 0) {
                        state = SEARCH_DISPOSITION_LINE;
                    }
                } else if (state == SEARCH_DISPOSITION_LINE) {
                    // 查找disposition行
                    let disposition = tmp.toString();
                    let ar = disposition.split(";");
                    if (ar[0]) {
                        curDisposition = ar[0].replace('Content-Disposition:', '');
                    }

                    if (ar[1]) {
                        curName = ar[1].split("=")[1];
                    }

                    if (ar[2]) {
                        curFilename = ar[2].split("=")[1].replace(/"/g, "");
                    }

                    if (curFilename) {
                        state = SEARCH_TYPE_LINE;
                    } else {
                        state = SEARCH_SPLIT_LINE;
                    }
                } else if (state == SEARCH_SPLIT_LINE) {
                    // 查找数据之前的空行
                    state = SEARCH_DATA_LINE;
                } else if (state == SEARCH_TYPE_LINE) {
                    // 查找文件类型行
                    let tpstr = tmp.toString();
                    curType = tpstr.replace('Content-Type:', '');
                    state = SEARCH_SPLIT_LINE;
                } else if (state == SEARCH_DATA_LINE) {
                    // 查找并填充数据
                    let bstr = tmp.toString();
                    if (bstr.indexOf(boundary) >= 0) {
                        state = SEARCH_DISPOSITION_LINE;
                        // 数据填充完毕，下一个数据
                        ret.push({
                            'disposition': curDisposition,
                            'name': curName,
                            'filename': curFilename,
                            'data': data.slice(curDataStart, offset - 2),
                            'type': curType
                        });

                        curName = null;
                        curType = null;
                        curFilename = null;
                        curDisposition = null;
                        curDataStart = 0;

                    } else if (curDataStart == 0) {
                        curDataStart = offset;
                    }
                }

                offset = i + 2;
            }
        }

        return ret;
    }

    // 解析值对
    parseParam(str: string, splitchar: string) {
        str = str.replace(/\s+/g, "");
        let ret: any = {};
        let ar = str.split(splitchar);
        for (let i = 0; i < ar.length; ++i) {
            let ep = ar[i].indexOf("=");
            let tmp = {};
            if (ep > 0) {
                ret[ar[i].substring(0, ep)] = ar[i].substring(ep + 1);
            } else {
                ret[ar[i]] = "";
            }
        }
        return ret;
    }

    // 连接请求处理过程
    processRequest(request: http.IncomingMessage|any, response: http.ServerResponse|any) {
        response.startTime = BaseFn.getTimeMS();
    
        request.getClientIp = function(){
            if (request.headers['x-forwarded-for']) 
				return request.headers['x-forwarded-for'];
			
			if (request.connection && request.connection.remoteAddress)
				return request.connection.remoteAddress;
			
			if (request.socket && request.socket.remoteAddress)
				return request.socket.remoteAddress;
			
			if (request.connection.socket && request.connection.socket.remoteAddress)
				return request.connection.socket.remoteAddress;
        };

        // 保底超时时间
        response.timeoutId = setInterval(() => {
            clearInterval(response.timeoutId);
            response.end({ success: false, desc: 'timeout' });
        }, 1000 * 60 * 20);

        // 跨域
        response.setHeader("Access-Control-Allow-Origin", "*");
        let urlstr = decodeURIComponent(request.url);
        let urldata: any = url.parse(urlstr);
        let pathName = decodeURIComponent(urldata.pathname);
        if (pathName[pathName.length - 1] == '/')
            pathName = pathName.substr(0, pathName.length - 1);

        // 替换response上面的write函数，使其支持直接输出非字符串和Buffer格式
        response.oldwrite = response.write.bind(response);
        response.write = function (v: any) {
            if (response.ended || v == null)
                return;

            let str;
            if ((v instanceof Buffer) || (typeof v == 'string')) {
                str = v;
            } else if (typeof v == 'object') {
                str = JSON.stringify(v);
            } else {
                str = v.toString();
            }
            response.oldwrite(str);
        };

        // 重写response.end函数，用来计算执行时间
        response.oldend = response.end;
        response.end = function (str: any) {
            clearInterval(response.timeoutId);
            if (str) {
                response.write(str);
            }
            response.oldend();
            response.ended = true;
            logDeb(request.getClientIp() + " visit " + (pathName == '' ? '/' : pathName)
                + " in " + (BaseFn.getTimeMS() - response.startTime) + "ms");
        };

        // resquest预处理函数
        let preRequest = (submain: any)=>{
            // nsp程序
            request.params = {};
            request.query = request.params;

            let subwrap = function () {
                // 填充params
                let par = urlstr.split("?");
                if (par.length > 1) {
                    par[1].split("&").forEach(c => {
                        let parts = c.split('=');
                        let o = null;
                        try{
                            o = JSON.parse(parts[1]);
                        } catch(e) {}
                        request.params[parts[0].trim()] = (o != null ? o : (parts[1] || '').trim());
                    });
                }

                // 填充cookies
                request.cookies = {};
                if (request.headers.cookie != null) {
                    request.headers.cookie.split(';').forEach((c:any)=>{
                        let parts = c.split('=');
                        request.cookies[parts[0].trim()] = (parts[1] || '').trim();
                    });
                }

                // 执行脚本
               // response.writeHead(200, { "Content-Type": "text/html" });
                submain();
            }

            request.method = request.method.toLowerCase();
            if(request.method == "post") {
                let temp = this.parseParam('content-type=' + request.headers["content-type"], ";");
                let ctype = temp["content-type"];
                let boundary = temp["boundary"];
                let clength = parseInt(request.headers["content-length"]);

                // 判断提交数据的大小，超过允许大小返回失败
                let deflength = BaseFn._MB(this.m_config.upload_limit) || 0xfffffff;
                if (clength > deflength) {
                    response.writeHead(500, { "content-type": "text/html" });
                    response.end("<h1>post data more then limit " + deflength + "</h1>");
                } else if (clength > 0) {
                    // 接收上传的数据
                    let postData = Buffer.alloc(clength);
                    let offset = 0;
                    request.on("data", (chunk: any) => {
                        chunk.copy(postData, offset);
                        offset += chunk.length;
                    });

                    request.on("end", () => {
                        // 接收完毕开始解析
                        if (ctype == 'application/x-www-form-urlencoded') {
                            urlstr = urlstr + (urlstr.indexOf('?') >= 0 ? '&' : '?') + postData.toString();
                        } else if (ctype.indexOf("form-data") >= 0) {
                            // 解析multipart/form-data
                            let mpdata = this.parseMultipart(postData, boundary);
                            if (mpdata) {
                                // 把文件和键值对分开
                                request.files = [];
                                for (let i = 0; i < mpdata.length; ++i) {
                                    let it = mpdata[i];
                                    if (it.filename && it.data) {
                                        request.files.push({ name: it.filename, data: it.data });
                                    } else if (it.name && it.data) {
                                        request.params[it.name] = it.data.toString();
                                    }
                                }
                            }
                        }
                        subwrap();
                    });
                }
            } else {
                subwrap();
            }
        };

        let router = this.m_routers[pathName];
        if (!router)
            router = this.m_routers['*'];
        if (router) {
            switch (router.type) {
                case 'object':
                case 'string':
                    response.end(router.data);
                    break;

                case 'file':
                    pathName = router.data;
                    break;

                case 'function':
                    preRequest(() => {
                        if (router.parentClass){
                            router.parentClass.request = request;
                            router.parentClass.response = response;
                            router.data.call(router.parentClass, request, response);
                        } else {
                            router.data(request, response);
                        }
                    });
                    break;
                default:
                    response.end(pathName + ' router failed!');
                    break;
            }
            return;
        }

        //获取文件的路径
        var filePath = path.normalize(path.join(this.m_config.root, pathName));

        //如果路径中没有扩展名
        if (path.extname(filePath) === '') {
            let ld = null;

            // 尝试获得文件信息
            try {
                ld = fs.lstatSync(filePath);
            } catch (e) {
                if (e.code != 'ENOENT') {
                    logErr(e.message);
                }
            }

            // 不是访问目录
            if (!ld || !ld.isDirectory()){
                // 存在同名nsp
                if (fs.existsSync(filePath + ".nsp")) {
                    filePath += ".nsp";
                } else if (fs.existsSync(filePath + ".nss")) {
                    filePath += ".nss";
                }
            } else if (ld && ld.isDirectory()) {
                // 访问目录, 尝试找到默认文件
                for (let i = 0; i < this.m_config.default_page.length; ++i) {
                    let tmp = path.normalize(path.join(filePath, this.m_config.default_page[i]))
                    if (fs.existsSync(tmp)) {
                        // 重定向
                        var redirect = (this.m_config.https ? "https://" : "http://") + request.headers.host  + pathName + "/" + this.m_config.default_page[i];
                        response.writeHead(301, {
                            location: redirect
                        });
                        response.end();
                        return;
                    }
                }
             }
        }

        //获取对应文件的文档类型
        var contentType = this.getContentType(filePath);

        fs.lstat(filePath, (err, stats) => {
            let e404 = false;
            if (!err) {
                if (!stats.isDirectory()) {
                    if (this.m_nsp.isNsp(filePath)) {
                        preRequest(() => {
                            try {
                                this.m_nsp.run(filePath, request, response, (err: any, data: any) => {
                                    response.end();
                                    if (err) {
                                        logErr(filePath + err);
                                    }
                                });
                            } catch (err) {
                                logErr(err);
                            }
                        });
                    } else {
                        // 静态文件
                        // 最后修改时间
                        let lastModified = stats.mtime.toUTCString();
                        let ifModifiedSince = "If-Modified-Since".toLowerCase();
                        response.setHeader("Last-Modified", lastModified);

                        // 过期时间
                        response.setHeader("Cache-Control", "max-age=" + 24 * 3600 * 2);

                        if (this.m_config.client_cache_first && request.headers[ifModifiedSince] 
							&& lastModified == request.headers[ifModifiedSince]) {
                            // 使用浏览器缓存
                            response.writeHead(304, "Not Modified");
                            response.end();
                        } else {

                            // 获得压缩传输的编码类型
                            let ccp = null;
                            let head: any = {"Content-Type": contentType };
                            if (this.m_config.compress) {
                                let acceptEncoding = request.headers['accept-encoding'] || '';
                                if (acceptEncoding.match(/\bgzip\b/)) {
                                    ccp = 'gz';
                                    head['Content-Encoding'] = 'gzip';
                                } else if (acceptEncoding.match(/\bdeflate\b/)) {
                                    ccp = 'dz';
                                    head['Content-Encoding'] = 'deflate';
                                }
								
								let fileExtName = path.extname(filePath);
                                for (let i = 0; i < this.m_config.comp_ignores.length && ccp; ++i) {
                                    if (this.m_config.comp_ignores[i] == fileExtName) {
                                        // 不需要压缩的文件扩展名
                                        ccp = null;
                                        head['Content-Encoding'] = 'none';
                                        break;
                                    }
                                }
                            }

                            // 使用缓存
                            if (this.m_config.server_filecache && stats.size < BaseFn._MB(this.m_config.cache_file_max)){
                                let fc = this.fileFromCache(filePath, ccp); 
                                if (fc) {
                                    head["Content-Length"] = fc.length;
                                    response.writeHead(200, "Ok", head);
                                    response.end(fc);
                                } else {
                                    response.writeHead(500, { "Content-Type": "text/html" });
                                    response.end("<h1>500 Server Error</h1>");
                                }
                            } else { // 直接传输
                                let raw = fs.createReadStream(filePath);
                                raw.on("error", ()=> {
                                    response.writeHead(500, { "Content-Type": "text/html" });
                                    response.end("<h1>500 Server Error</h1>");
                                });

                                if (ccp == 'gz') {
                                    response.writeHead(200, "Ok", head);
                                    raw.pipe(zlib.createGzip()).pipe(response);
                                } else if (ccp == 'dz') {
                                    response.writeHead(200, "Ok", head);
                                    raw.pipe(zlib.createDeflate()).pipe(response);
                                } else {
                                    head["Content-Length"] = stats.size;
                                    response.writeHead(200, "Ok", head);
                                    raw.pipe(response);
                                }
                            } // if (svr cache)
                        } // if (client cache)
                    } // if (nsp)
                } else if (this.m_config.dir_visit) {
                    response.writeHead(200, { "Content-Type": "text/html" });
                    let html = "<head><meta charset='utf-8'></head>";
                    try {
                        //用户访问目录
                        let filedir = filePath;
                        //获取用户访问路径下的文件列表
                        fs.readdir(filedir, (err, data) => {
							html += "<pre>";
                            for (let i = 0; i < data.length; i++) {
								let ld: fs.Stats = fs.lstatSync(path.join(filedir, data[i]));
                                let filename = data[i];
                                html += (BaseFn.getTimeString('yymdhis', ld.mtime) + "\t" + (ld.size > 0 ? ld.size : "dir") +  "\t\t"
									+ "<a  href='" + filename + (ld.isDirectory() ? "/" : "") + "'>" + filename + "</a><br>");
                            }
							html += "</pre>";
                            response.end(html);
                        });

                    } catch (e) {
                        html += "<h1>您访问的目录不存在</h1>"
                        response.end(html);
                    }
                } else {
                    e404 = true;
                }

            } else {
                e404 = true;
            }

            // 什么都没找到
            if (e404) {
                response.writeHead(404, { "Content-Type": "text/html" });
                response.end("<h1>404 Not Found</h1>");
            }
        });
    }

    // 获取文件类型
    getContentType(filePath: any) {
        var contentType = this.m_config.mime;
        var ext = path.extname(filePath).substr(1);
        if (contentType.hasOwnProperty(ext)) {
            return contentType[ext];
        } else {
            return contentType.default;
        }
    }

    // 添加功能路由
    addRouter(file: string, obj: any, parentClass: any) {
        let router = null;
        if (typeof obj === 'string' && fs.existsSync(obj)) {
            router = { type: 'file', data: obj };
        } else if (obj){
            router = { type: typeof obj, data: obj, parentClass: parentClass};
        }

        if (router) {
            this.m_routers[file] = router;
        }

        return router != null;
    }

}
