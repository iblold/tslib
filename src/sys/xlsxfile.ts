/******************************************************
 * @Description: 
 * @Date: 2018-12-16 12:43:23
 * @Author: iblold@gmail.com
 * @LastEditTime: 2018-12-16 20:02:21
 *******************************************************/
import * as xml2js from 'xml2js';
import { BaseFn } from './basefunc';
const zipper = require('zip-local');

export class XlsxFile{
    constructor(){

    }

    static read(zfile: string, cb: (err: any, result: any)=>void, isFLineDesc: boolean|null = null) {
        if (typeof isFLineDesc == 'function') {
            cb = isFLineDesc;
            isFLineDesc = false;
        } else if (isFLineDesc == null) {
            cb('cb must be not null', null);
        }
    
        zipper.unzip(zfile, (error: any, unzipped: any) => {
            if (!error) {
                let zmem = unzipped.memory();
                let flst = zmem.contents();
                let fstr = zmem.read('xl/sharedStrings.xml', 'text');
                let sheets: any = [];
    
                let firstLine = isFLineDesc ? 1 : 0;
    
                for (let i = 0; i < flst.length; ++i) {
                    let f = flst[i];
                    if (f.indexOf('xl/worksheets/') > -1) {
                        sheets.push(zmem.read(f, 'text'));
                    }
                }
    
                let results: any = [];
    
                xml2js.parseString(fstr, { explicitArray: false }, (err, json) => {
    
                    if (!err) {
    
                        let sstr = json;
    
                        for (let i = 0; i < sheets.length; ++i) {
                            let s = sheets[i];
    
                            xml2js.parseString(s, { explicitArray: false }, (err, json) => {
                                if (!err) {
    
                                    if (!json.worksheet || !json.worksheet.sheetData)
                                        return;
    
                                    let res: any = [];
                                    res.fmap = {};
    
                                    res.get = function (v: any, n: any) {
                                        if (v == null) {
                                            return null;
                                        } else {
                                            if (!n) {
                                                let idx = res.fmap[v];
                                                if (idx != null) {
                                                    let r = res[idx];
                                                    return r;
                                                }
                                                return null;
                                            } else {
                                                let key = null;
                                                if (!isNaN(n)) {
                                                    key = res.head[n - 1];
                                                } else if (typeof n == 'string') {
                                                    key = n;
                                                }
    
                                                if (key) {
                                                    for (let i = 0; i < res.length; i++) {
                                                        let r = res[i];
                                                        if (r[key] == v)
                                                            return r;
                                                    }
                                                }
                                                return null;
                                            }
                                        }
                                    }
    
                                    let head: any = null;
    
                                    for (let j = 0; j < json.worksheet.sheetData.row.length; ++j) {
    
                                        let row: any = {};
                                        let tmp = json.worksheet.sheetData.row[j].c;
    
                                        if (j == firstLine) {
                                            head = [];
                                            for (let l = 0; l < tmp.length; ++l) {
                                                if (tmp[l].v) {
                                                    head.push(sstr.sst.si[tmp[l].v].t);
                                                }
                                            }
                                            res.head = head;
                                        } else if (j > firstLine) {
                                            for (let l = 0; l < tmp.length; ++l) {
                                                let t = tmp[l];
                                                if (t.$.t == 's') {
                                                    if (sstr.sst.si[t.v].r) {
                                                        let m = '';
                                                        for (let n = 0; n < sstr.sst.si[t.v].r.length; n++) {
                                                            m += sstr.sst.si[t.v].r[n].t;
                                                        }
                                                        row[head[l]] = m;
                                                    } else {
                                                        row[head[l]] = sstr.sst.si[t.v].t;
                                                    }
                                                }
                                                else {
                                                    let tv = t.v;
                                                    if (!isNaN(tv) && tv[0] != '0')
                                                        tv = parseInt(tv);
    
                                                    row[head[l]] = t.v;
                                                }
                                            }
                                            res.fmap[row[head[0]]] = res.length;
                                            res.push(row);
                                        }
                                    }
    
                                    results.push(res);
    
                                    if (i == sheets.length - 1) {
                                        cb(null, results);
                                    }
                                } else {
                                    cb(err, null);
                                }
                            });
                        }
    
                    } else {
                        cb(err, null);
                    }
                });
            } else {
                cb(error, null);
            }
        });
    }
}
