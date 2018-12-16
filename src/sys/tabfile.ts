/******************************************************
 * @Description: 
 * @Date: 2018-12-16 12:43:06
 * @Author: iblold@gmail.com
 * @LastEditTime: 2018-12-16 19:34:29
 *******************************************************/
 import * as fs from 'fs';
 import { BaseFn } from './basefunc';

 /** excel等导出的txt表格文件读取类 */
 export class TableFile{
     /** 结果集 */
     m_result: any;

     /** 表头 */
     m_head: any;

     /**
      * 初始化
      * @param path 文件路径
      * @param split 单元格分割符, 默认\t
      * @param firstRowIsRem 首行是否注释, 默认true
      */
     constructor(path: string, split:string = '\t', firstRowIsRem: boolean = true){
         this.m_result = [];
         this.m_head = null;
        let str = BaseFn.getFileTxt(path);
        if (str){
            let sp = '\n';
            if (str.indexOf('\r\n') >= 0) sp = '\r\n';
            let rows = str.split(sp);
            
            for(let i = 0; i < rows.length; i++){
                let buff = rows[i];
                let values: any = buff.split(split);
                if (firstRowIsRem && i == 0)
                    continue;

                for(let j = 0; j < values.length; j++){
                    values[j] = values[j].replace(/^\s+|\s+$/g,'');
                    values[j] = values[j].replace(/^\"+|\"+$/g,'');

                    if (this.m_head != null)
                        values[j] = isNaN(values[j]) ? values[j] : Number(values[j]);
                }

                if (this.m_head == null){
                    this.m_head = values;
                } else {
                    let cell: any = {};
                    for(let j = 0; j < this.m_head.length; j++){ 
                        cell[this.m_head[j]] = values[j] || '';
                    }
                    this.m_result.push(cell);
                }
            }
        }
     }

     /**
      * 获取第index列记录
      * @param index 第几列
      * @return 返回行结果集或者空
      */
     get(index: number){
        return this.m_result[index];
     }

     /**
      * 根据列名和值返回结果集
      * @param key 列名
      * @param value 值
      */
     find(key: string, value: any): [{key: string, value: any}];

     /**
      * 查找多个列值都符合的记录
      * @param param 多个列名和值的合集
      */
     find(param: [{key: string, value: any}]): {key: string, value: any};
     find(){
         let p: any = arguments[0];
         if (typeof p == 'string'){
             let key = p;
             let value = arguments[1];
             for(let i = 0; i < this.m_result.length; i++){
                let row = this.m_result[i];
                if (row[key] == value){
                    return row;
                }
             }
         } else {
             try{
                for(let i = 0; i < this.m_result.length; i++){
                    let row = this.m_result[i];
                    let fnd = 0;
                    for(let j = 0; j < p.length; j++){
                        let key = p[i].key;
                        let value = p[i].value;
                        if(row[key] == value){
                            fnd++;
                        }
                    }
                    if (fnd == p.length){
                        return row;
                    }
                }
            } catch(err){
                return null;
            }
         }

        return null;
     }
 }
