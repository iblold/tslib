/******************************************************
 * @Description: 
 * @Date: 2018-12-15 20:38:00
 * @Author: iblold@gmail.com
 * @LastEditTime: 2018-12-16 23:00:55
 *******************************************************/
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

/** 常用函数合集 */
export class BaseFn{
    /**
     * 创建目录, 会完整的创建路径中的每一级
     * @param path 目录
     */
    static mkdir(path: string){
		path = path.replace(/\\/g, "/");
		let dirs = path.split("/");
		let buf = "";
		for(let i = 0; i < dirs.length; ++i){
			if (dirs[i] != "")
			{
				buf = buf + dirs[i];
				
				if (!fs.existsSync(buf))
					fs.mkdirSync(buf);
				
				buf += "/";
			}
		}
    }

    /**
     * 获取日期时间字符串
     * @param fmt 时间格式, y m d h i s分别用于填充年月日时分秒
     * @param date 需要被格式化的日期时间, 如果为空则使用当前时间
     */
    static getTimeString(fmt: String = 'yyyy-mm-dd hh:ii:ss', date: Date | null = null){
        let cur = date || new Date();
        let str = fmt || 'yyyy-mm-dd hh-ii-ss';
        const names = ['yyyy', 'yy', 'mm', 'm', 'dd', 'd', 'hh', 'h', 'ii', 'i', 'ss', 's']; 
        
        const nmbs = [
            cur.getFullYear().toString(),
            (cur.getFullYear() - 2000).toString(),
            (cur.getMonth() + 1) < 10 ? '0' + (cur.getMonth() + 1) : (cur.getMonth() + 1).toString(),
            cur.getMonth().toString(),
            cur.getDate() < 10 ? '0' + cur.getDate() : cur.getDate().toString(),
            cur.getDate().toString(),

            cur.getHours() < 10 ? '0' + cur.getHours() : cur.getHours().toString(),
            cur.getHours().toString(),
            cur.getMinutes() < 10 ? '0' + cur.getMinutes() : cur.getMinutes().toString(),
            cur.getMinutes().toString(),
            cur.getSeconds() < 10 ? '0' + cur.getSeconds() : cur.getSeconds().toString(),
            cur.getSeconds().toString(),
        ];

        for(let i = 0; i < 12; i += 2){
            let fnd = false;
            str = str.replace(names[i], ()=>{
                fnd = true;
                return nmbs[i];
            });
            if(!fnd){
                str = str.replace(names[i + 1], nmbs[i + 1]);
            }
        }

        return str;
    }

    /**
     * 等待条件满足执行回调
     * @param condition 条件判断函数
     * @param cb 条件满足或者超时回调
     * @param timeout 超时时间 
     */
    static WaitFor(condition: ()=>boolean, cb: (result: string | null)=>void, timeout: number = 30){
        if (!condition || !cb)
            return;
        let t = Math.ceil(timeout * 1000);
        let ht = setInterval(()=>{
            t -= 16;
            if(condition() || t <= 0){
                clearInterval(ht);
                cb(t <= 0 ? 'timeout' : null);
            }
        }, 16);
    }

    /**
     * 获得完整路径
     * @param path 任意路径
     */
    static getFullPath(path: string): string{
        path = path.replace(/\\/g, "/");
        // 当前目录
        let curpath = process.cwd().replace(/\\/g, "/");
        
        let curdirs = curpath.split("/");
        let end = curdirs.length - 1;

        let r = "";
        // 顶级目录
        if (path.indexOf(":") >= 0 || path.indexOf("/") == 0) {
            return path;
        } else {
            // 每级目录
            let dirs = path.split("/");
            for (let i = 0; i < dirs.length; ++i) {
                let dir = dirs[i];
                if (dir != "") {
                    // 上一级
                    if (dir == "..") {
                        end--;
                    } else if (dir == ".") {
                        continue;
                    } else {
                        r += ("/" + dir);
                    }
                }
            }
        }
        
        // 加上运行目录
        for (let i = end; i >= 0; i--) {
            if (r.indexOf("/") != 0) {
                r = (curdirs[i] + "/" + r);
            } else {
                r = curdirs[i] + r;
            }
            
        }

        return r;
    }

    /** 获取时间, 秒 */
    static getTimeSE()
    {
        return Math.floor((new Date()).getTime() / 1000);
    }

    /** 获取时间, 毫秒 */
    static getTimeMS()
    {
        return new Date().getTime();
    }

    /** 获得一个自增数 */
    static globalID(){
        let c = (<any>global).g_globalID_ || 0;
        (<any>global).g_globalID_ = ++c;
        return c;
    }

    /** 使用mac地址和时间、随机数组合成的192位uid */ 
    static makeGuid()
    {
        let mac = (<any>global).g_uuid_mac;
        if (!mac) {
            let inet = os.networkInterfaces();
            for (let x in inet) {
                let s = inet[x];
                if (s[0].mac != '00:00:00:00:00:00') {
                    mac = s[0].mac.replace(/:/g, '');
                    (<any>global).g_uuid_mac = mac;
                    break;
                }
            }
        }

        return mac + new Date().getTime().toString(16) + (BaseFn.globalID() % 256).toString(16);
    }

    /**
     * 判断是否是文本文件的bom
     * @param buf 文件内容
     */
    static isBom(buf: Buffer): boolean{
        return buf[0] == 0xEF && buf[1] == 0xBB && buf[2] == 0xBF;
    }

    /**
     * 获得文本文件内容
     * @param path 文件路径
     */
    static getFileTxt(path: string){
        path = BaseFn.getFullPath(path);

        if (fs.existsSync(path)) {
            let data = fs.readFileSync(path);
            if (BaseFn.isBom(data)) {
                return data.slice(3).toString();
            } else {
                return data.toString();
            }
            
        } else {
            return null;
        }
    }

    /**
     * 返回[min, max] 之间的随机数, 默认[0, 32768]
     * @param min 最小值
     * @param max 最大值
     */
    static rand(min: number|null = null, max: number|null = null){
        if (min == null) {
            min = 0;
        }
        if (max == null) {
            max = 32768;
        }
        return Math.floor(min + Math.random() * (max - min + 1));
    }

    /**
     * 把xxx.xxx.xxx.xxx格式的IP转为整数地址
     * @param ip 字符串ip
     */
    static ip2Int(ip: string) 
    {
        if (ip.indexOf(':') >= 0){
            ip = ip.replace('::ffff:', '');
        }
        var num = 0;
        let ar = ip.split(".");
        num = (Number(ar[0]) << 24) | (Number(ar[1]) << 16) | (Number(ar[2]) << 8) | Number(ar[3]);
        num = num >>> 0;
        return num;
    }

    /**
     * 把整形IP转换为xxx.xxx.xxx.xxx形式
     * @param num 整数ip
     */
    static int2Ip(num: number) 
    {
        var str;
        var tt = new Array();
        tt[0] = (num >>> 24) >>> 0;
        tt[1] = ((num << 8) >>> 24) >>> 0;
        tt[2] = (num << 16) >>> 24;
        tt[3] = (num << 24) >>> 24;
        str = String(tt[0]) + "." + String(tt[1]) + "." + String(tt[2]) + "." + String(tt[3]);
        return str;
    }

    /**
     * 把对象序列化为json包括函数
     * @param obj 需要序列化的对象
     */
    static objectToSource(obj: any) {
        if (obj instanceof Object) {
            obj.zzzzDummy = 0;
            let str = JSON.stringify(obj);

            let strfunc = "";
            for (let v in obj) {
                let c = obj[v];
                if (c instanceof Function) {
                    let s = c.toString();
                    strfunc += (v + ':' + s);
                    strfunc += ","
                }
            }
            str = str.replace(/"zzzzDummy":0/g, strfunc.substring(0, strfunc.length - 1));
            obj.zzzzDummy = null;
            return str;
        }
        return null;
    }

    /**
     * 文件拷贝函数
     * @param srcPath 源路径
     * @param dstPath 目标路径
     * @param cb 回调函数
     */
    static fileCopy(srcPath: string, dstPath: string, cb: (err: Error|null)=>void) {
        fs.exists(srcPath, exists => {
            if (exists) {
                let src = fs.createReadStream(srcPath);
                let dst = fs.createWriteStream(dstPath);
                dst.on("error", err => {
                    cb(err);
                });

                dst.on("close", ()=>{
                    cb(null);
                });

                src.pipe(dst);
            } else {
                cb(new Error("src file not exists"));
            }
        });
    }

    /**
     * bkdr算法哈希函数
     * @param str 
     */
    static bkdrHash(str: string){
        let seed = 131;
        let hash = new Uint32Array([0]);

        for (let i = 0; i < str.length; i++) {
            hash[0] = hash[0] * seed + str.charCodeAt(i);
        }

        return hash[0] & 0x7FFFFFFF;
    }

    /**
     * 读取带注释的json文件
     * @param filePath 文件路径
     */
    static jsonWithRem(filePath: string) {
        return eval('(' + fs.readFileSync(path.normalize(filePath)) + ')');
    }

    /**
     * 克隆对象
     * @param obj 需要克隆的对象
     */
    static clone(obj: any){
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (err) {
            return null;
        }
    }

    /**
     * 计算字符串MD5值
     * @param str 
     */
    static md5(str: string){
        return crypto.createHash('md5').update(str).digest('hex');
    }

    /** 同步遍历文件夹 */
    static enumFiles(path: string, regex: any){
        let results: any = []
        let list = fs.readdirSync(path)
        list.forEach(function(file) {
            file = path + '/' + file
            var stat = fs.statSync(file)
            if (stat && stat.isDirectory()) {
                results = results.concat(BaseFn.enumFiles(file, regex));
            } else {
                if (regex.test(file)){
                    results.push(file);
                }
            }
        })
        return results
    }

    /**
     * 移动Buffer一段内容到自身的其他地方
     * @param buffer Node Buffer
     * @param from 
     * @param to 
     */
    static moveBufferSelf(buffer: Buffer, from: {begin: number, end: number}, to: {begin: number, end: number}){
        (<any>global)._movetoself_temp = (<any>global)._movetoself_temp || Buffer.alloc(BaseFn._MB(1));
        if ((from.begin < to.begin && from.end < to.begin) || (to.begin < from.begin && to.end < from.end)){
            buffer.copy(buffer, to.begin, from.begin, from.end);
        } else {
            let temp: Buffer = (<any>global)._movetoself_temp;
            buffer.copy(temp, 0, from.begin, from.end);
            temp.copy(buffer, to.begin, 0, from.end - from.begin);
        }
    }

    /**去掉字符串前后空白 */
    static trimlr(str:string) {
        return str.replace(/(^\s*)|(\s*$)/g, '');
    }

    /** 返回n兆的字节数 */
    static _MB(n: number) {
        return n * 1048576;
    }

    /** 返回n KB的字节数 */
    static _KB(n: number) {
        return n * 1024;
    }

    /** 返回n秒的毫秒数 */
    static _second(n: number){
        return 1000 * n;
    }

    /** 返回n分钟的毫秒数 */
    static _minute(n: number){
        return 60000 * n;
    }

    /** 返回n小时的毫秒数 */
    static _hour(n: number){
        return 3600000 * n;
    }

    /** 返回n天的毫秒数 */
    static _day(n: number){
        return BaseFn._hour(24) * n;
    }

    /** 返回n星期的毫秒数 */
    static _week(n: number){
        return BaseFn._day(7) * n;
    }
}
