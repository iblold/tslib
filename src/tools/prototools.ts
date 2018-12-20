import * as fs from 'fs';
import * as path from 'path';
import { isatty } from 'tty';
import { CLIENT_RENEG_LIMIT } from 'tls';

const crlf = '\r\n';
const tab = '\t';

/** 协议类型映射表 */
const typeMap = {
    /**原生类型 */
    native: ['int8', 'int16', 'int32', 'uint8', 'uint16', 'uint32', 'float', 'double', 'string', 'bool'],
    default: ['0', '0', '0', '0', '0', '0', '0', '0', '""', 'false'],

    /**js/ts类型 */
    js: ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'string', 'boolean'],
    /**c#类型 */
    cs: ['sbyte', 'Int16', 'int', 'byte', 'UInt16', 'int', 'float', 'double', 'string', 'bool'],

    transType: function(type: string, region: string[]){
        let i = this.native.indexOf(type||'');
        if (i >= 0){
            return region[i];
        }
    },

    getJsType: function(type: string){
        return this.transType(type, this.js) || type;
    },

    getDefault: function(type: string){
        return this.transType(type, this.default) || ('new ' + type + '()');
    },

    getCsType: function(type: string){
        return this.transType(type, this.cs) || type;
    }
}

/**运行参数 */
class Config{
    inputFile: string;
    outputFile: string;
    outputDTS: boolean;
    type: string;
    constructor(){
        this.inputFile = '';
        this.outputFile = '';
        this.type = 'ts';
        this.outputDTS = false;
    }
}

/**结构体成员信息 */
class Member{
    rem: string;
    name: string;
    type: string;
    line: number;
    isArray: boolean;
    value: number|string;
    constructor(rem = '', name = '', type = ''
        , line = -1, isArray = false, value = 0){
        this.rem = rem;
        this.name = name;
        this.type = type;
        this.line = line;
        this.isArray = isArray;
        this.value = value;
    }
}

/**结构体信息 */
class Block extends Member{
    members: Member[]; 
    request: Block|null;
    reponse: Block|null;
    parent: Block|null;
    constType: string;
    constructor(name = '', type = '', line = -1, rem = ''){
        super(rem, name, type, line);
        this.members = [];
        this.request = null;
        this.reponse = null;
        this.parent = null;
        this.constType = '';
    }

    typeCost(){
        switch (this.type) {
            case 'const':
                return 0;
            case 'enum':
                return 1;
            case 'struct':
                return 2;
            case 'protocol':
                return 3;
            default:
                return -1;
        }  
    }
}

/**缩进适配 */
class TabCache{
    m_tabs: string;
    constructor(){
        this.m_tabs = '';
    }

    push(){
        this.m_tabs += tab;
    }

    pop(){
        this.m_tabs = this.m_tabs.substr(0, this.m_tabs.length - 1);
    }

    v(): string{
        return this.m_tabs;
    }
}
/**解析运行参数 */
function parseArgs(){
    let params = process.argv;
    let config = new Config();
    // 解析启动参数
    for (let i = 0; i < params.length; ++i) {
        if (params[i] == '-i') {
            config.inputFile = params[i + 1];
        } else if (params[i] == '-o') {
            config.outputFile = params[i + 1];
        } else if (params[i] == '-l') {
            config.type = params[i + 1];
        } else if (params[i] == '-dts'){
            config.outputDTS = true;
        }
    }
    return config;
}

// 去掉字符串前后空白
function trimlr(str:string) {
    return str.replace(/(^\s*)|(\s*$)/g, '');
}

/**解析协议文本 */
function parse(fpath: string, typeBuffer: {[key: string]:boolean}) {

    let curdir = './';
    let fb = fs.readFileSync(fpath);
    let str = null;
    if (fb) {
        str = fb.toString();
        curdir = path.dirname(fpath);
    } else {
        console.log('file ' + fpath + ' not exist.');
        return;
    }

    // 分析过程状态定义
    /**查找定义名 */
    let S_FINDDEF = 0;
    /**查找定义开始位置 */      
    let S_FINDBODYST = 1;   // 
    /**查找定义体 */
    let S_FINDBODY = 3;     // 
    /**查找内部定义开始位置 */
    let S_FINDINNST = 4;    // 
    /**查找内部定义体 */
    let S_FINDINNBODY = 6;  // 
    /**查找枚举定义开始位置 */
    let S_FINDENUMST = 7;   // 
    /**查找枚举定义体 */
    let S_FINDENUMBODY = 8;     // 

    let state = S_FINDDEF;

    // 全部定义内容
    let blocks: Block[] = [];
    // 统计所有成员名称，用来生成json简化用字符表
    let words: string[] = [];

    // 注释内容
    let rems: {[key:number]:string} = {};

    // 所有的行
    let lines = str.split('\r\n');

    let curBlock: Block = new Block();
    let curInsideBlock: Block = new Block();
    let lastline = 0;

    let protocolRem = '';

    // 用作解析过程判定类型是否存在
    for (let i = 0; i < typeMap.native.length; ++i) {
        typeBuffer[typeMap.native[i]] = true;
    }

    for (let i = 0; i < lines.length; ++i) {
        let line = lines[i];
        // 清除字符串前后空白
        line = trimlr(line);

        if (line.length > 0) {
            let rem = rems[i - 1];
            // 本行是否注释
            if (line.indexOf('//!') == 0) {
                // 注释保存
                rems[i] = trimlr(line.replace('//!', ''));
                if (i == 0) protocolRem = rems[0];

            // 本行是否包含文件
            } else if (line.indexOf('#include') > -1) {

                // 解析包含文件
                let inc = line.match(/#include\s*"([\w\W]+)"\s*;/);
                if (inc!= null && inc.length == 2) {
                    if (path.basename(inc[1]) != path.basename(fpath)){
                        parse(path.join(curdir, inc[1]), typeBuffer);
                    }
                }
            } else {
                // 删除行注释
                line = line.replace(/\/\/[\s\S\w\W]+/g, '');
                if (line.length > 0) {
                    if (state == S_FINDDEF) {
                        // 查找结构和协议定义名称
                        let blockInfo = line.match(/\s*(struct|protocol|enum)\s*([\w]+)\s*/);
                        if (blockInfo != null && blockInfo.length == 3) {
                            
                            curBlock =  new Block(blockInfo[2], blockInfo[1], i, rem);
                            
                            if (curBlock.type == 'struct') {
                                typeBuffer[curBlock.name] = true;
                                words.push(curBlock.name);
                            }

                            if (line.indexOf('{') > 0) {
                                state = S_FINDBODY;
                                if (curBlock.type == 'enum') {
                                    state = S_FINDENUMBODY;
                                }
                                lastline = i;
                            } else {
                                state = S_FINDBODYST;
                                if (curBlock.type == 'enum') {
                                    state = S_FINDENUMST;
                                }
                                lastline = i;
                            }
                        } else if (line.indexOf('const') == 0) {
                            // 常量定义
                            let constInfo = line.match(/const\s*(\w+)\s*(\w+)\s*=\s*([\'\"\W\w]*)\s*;/);
                            let err = false;
                            if (constInfo != null && constInfo.length == 4) {
                                let constBlock = new Block(constInfo[2], 'const', i, rem);
                                constBlock.value = constInfo[3];
                                constBlock.constType = constInfo[1];
                                blocks.push(constBlock);
                            } else {
                                console.log('解析常量定义错误: ' + line + ' 行 ' + i);
                                return;
                            }
                        }
                    } else if (state == S_FINDBODYST) {
                        if (line.indexOf('{') >= 0) {
                            state = S_FINDBODY;
                            lastline = i;
                        }
                    } else if (state == S_FINDBODY) {
                        // 查找内部定义
                        let insideInfo = line.match(/(req|resp)\s*/);
                        if (insideInfo && insideInfo.length == 2) {
                            
                            curInsideBlock = new Block(insideInfo[1], 'struct', i, rem);
                            curInsideBlock.parent = curBlock;
                            if (curInsideBlock.name == 'req') {
                                curBlock.request = curInsideBlock;
                            } else if (curInsideBlock.name == 'resp') {
                                curBlock.reponse = curInsideBlock;
                            }
                            if (line.indexOf('{') >= 0) {
                                state = S_FINDINNBODY;
                                lastline = i;
                            } else {
                                state = S_FINDINNST;
                                lastline = i;
                            }
                        } else {
                            // 查找成员定义
                            let member = line.match(/\s*(\w+)\s*([\w\[\]]+)\s*/);
                            if (member && member.length == 3) {
                                if (!typeBuffer[member[1]]) {
                                    console.log('成员 ' + member[1] + ' 没有定义。行 ' + i);
                                    return;
                                }

                                let isArray = (member[2].indexOf('[') > 0);
                                let mname = member[2].replace(/\[|\]/g, '');
                                
                                curBlock.members.push(new Member(rem, mname, member[1], i, isArray));
                                words.push(mname); 
                            }

                            if (line.indexOf('}') >= 0) {
                                if (curBlock.type == 'protocol') {
                                    if ((curBlock.request && !curBlock.reponse) || (!curBlock.request && curBlock.reponse)) {
                                        console.log('协议中req和resp必须同时存在。 ： 行 ' + i);
                                        return;
                                    }
                                }
                                blocks.push(curBlock);
                                state = S_FINDDEF;
                                lastline = i;
                            }
                        }
                    } else if (state == S_FINDINNST) {
                        if (line.indexOf('{') >= 0) {
                            state = S_FINDINNBODY;
                            lastline = i;
                        }
                    } else if (state == S_FINDINNBODY) {
                        // 查找内部结构成员定义
                        let member = line.match(/\s*(\w+)\s*([\w\[\]]+)\s*/);
                        if (member && member.length == 3) {
                            if (!typeBuffer[member[1]]) {
                                console.log('成员 ' + member[1] + ' 没有定义。行 ' + i);
                                return;
                            }
                            
                            let isArrsy = (member[2].indexOf('[') > 0);
                            let mname = member[2].replace(/\[|\]/g, '');
                            curInsideBlock.members.push(new Member(rem, mname, member[1], i, isArrsy));
                            words.push(mname);
                        }

                        if (line.indexOf('}') >= 0) {
                            state = S_FINDBODY;
                            lastline = i;
                        }
                    } else if (state == S_FINDENUMST) {
                        if (line.indexOf('{') >= 0) {
                            state = S_FINDENUMBODY;
                            lastline = i;
                        }
                    } else if (state == S_FINDENUMBODY) {

                        let member = line.match(/(\w+)\s*[=]*\s*(\w+)*/);
                        if (member && member.length == 3) {
                            if (!isNaN(Number(member[2]))) {
                                curBlock.value = Number(member[2]);
                            } 

                            curBlock.members.push(new Member(rem, member[1], 'enum', i, false, (<number>curBlock.value)++));
                        }
                        if (line.indexOf('}') >= 0) {
                            blocks.push(curBlock);
                            state = S_FINDDEF;
                            lastline = i;
                        }
                    } // if (state == xxx)

                }   // if (line.length > 0) 
            }   //  if (line.indexOf('//!') == 0) {
        } //  if (line.length > 0) 
    } // for (let i = 0; i < linestrs.length; ++i) 

    switch (state) {
        case S_FINDBODYST:
            console.log('解析struct或者protocol失败。 行 ' + lastline);
            return null;
        case S_FINDBODY:
            console.log('解析成员失败。行 ' + lastline);
            return null;
        case S_FINDINNST:
            console.log('解析req或者resp失败。 行 ' + lastline);
            return null;
        case S_FINDINNBODY:
            console.log('解析req或者resp的成员失败。行 ' + lastline);
            return null;
        case S_FINDENUMBODY:
        case S_FINDENUMST:
            console.log('解析enum失败。行 ' + lastline);
            return null;
    }

    // 按const, enum, struct, protocol排序
    blocks.sort((a, b) => {
        let n = a.typeCost() - b.typeCost();
        if (n == 0){
            return a.name.localeCompare(b.name);
        } else {
            return n;
        }
    });

    (<any>blocks).rem = protocolRem;
    return blocks;
}

function main(){
    let config = parseArgs();

    if (config.inputFile == '' || config.outputFile == ''){
        console.log('参数错误.\r\n可用参数有-i 输入文件， -o 输出文件 -l [cs|js|ts] 协议语言 -dts 同时输出.d.ts文件\r\n例如 node prototool.js -i xxx -o xxx -l cs');
        return;
    }

    let blocks = parse(config.inputFile, {});
    if (blocks){
        let protocol: string|null = null;
        switch(config.type){
            case 'cs':
                protocol = makeProtocolCS(blocks);
            break;

            case 'ts':
                protocol = makeProtocolTS(blocks);
            break;

            case 'js':
                protocol = makeProtocolJS(blocks);
            break;
        }

        if (config.outputDTS){
            let dts = makeDTS(blocks);
            let dtsPath = path.join(path.dirname(config.outputFile), 
                path.basename(config.outputFile).replace(path.extname(config.outputFile), '.d.ts'));
            fs.writeFileSync(dtsPath, dts);
        }

        if (protocol){
            fs.writeFileSync(config.outputFile, protocol);
            console.log('生成协议成功!');
        }
    }
}

/**生成ts协议 */
function makeProtocolTS(blocks: Block[]): string|null{
    // 缩进控制
    let tc = new TabCache();
    let outer = tc.v() + '// ' + (<any>blocks).rem + crlf;

    // 输出成员的注释
    let printRem = (block: Member, ext = '')=>{
        if (block.rem && block.rem != ''){
            outer += tc.v() + '/**' + block.rem + ext + ' */' + crlf;
        }
    }
    
    // 生成结构体和协议结构体
    let makeStruct = (block: Block, isProtocol = false)=>{
        let blockName = (block.parent ? block.parent.name + '_' : '') + block.name;
        outer += tc.v() + 'export class ' + blockName + '{' + crlf;

        tc.push();

        if (isProtocol){
            let cmd = '';
            if (block.parent){
                cmd = block.parent.name + '.' + block.name; 
            } else {
                cmd = block.name;
            }
            outer += tc.v() + 'static cmd = \'' + cmd + '\';' + crlf; 
            outer += tc.v() + 'cmd: string;' + crlf; 
        }

        let ctorSubject = 'constructor(_params_){' + crlf;
        let ctorParams = '';

        for(let j = 0; j < block.members.length; j++){
            let member = block.members[j];
            printRem(member);
            outer += tc.v() + member.name + ': ' + typeMap.getJsType(member.type) + (member.isArray ? '[]':'') + ';' + crlf;

            tc.push();
            ctorSubject += tc.v() + 'this.' + member.name + ' = ' + member.name + ';' + crlf;
            tc.pop();

            ctorParams += member.name + ': ' + typeMap.getJsType(member.type) + (member.isArray ? '[]':'')
                + ' = ' + (member.isArray ? '[]' : typeMap.getDefault(member.type)) 
                + (j < block.members.length - 1 ? ', ' : '');
        }

        tc.push();
        ctorSubject += tc.v() + 'this.cmd = ' + blockName + '.cmd' + crlf;
        tc.pop();

        outer += tc.v() + ctorSubject.replace('_params_', ctorParams) + crlf;
        outer += tc.v() + '}' + crlf;

        tc.pop();
        outer += tc.v() + '}' + crlf;
    }

    for(let i = 0; i < blocks.length; i++){
        let block = blocks[i];
        
        printRem(block, ' type: ' + block.type);
        if (block.type == 'const'){

            outer += tc.v() + 'export const ' + block.name + ' = ' + block.value + ';' + crlf;

        } else if (block.type == 'enum'){

            outer += tc.v() + 'export const ' + block.name + ' = {' + crlf;
            tc.push();

            for(let j = 0; j < block.members.length; j++){
                let member = block.members[j];
                printRem(member);
                outer += tc.v() + member.name + ': ' + member.value + ',' + crlf;
            }

            tc.pop();
            outer += tc.v() + '}' + crlf;

        } else if (block.type == 'struct' || block.type == 'protocol'){
            if (block.reponse && block.request){
                printRem(block, 'request');
                makeStruct(block.request, true);
                printRem(block, 'response');
                makeStruct(block.reponse, true);
            } else {
                makeStruct(block, true);
            }

        }

        outer += crlf;
    }

    outer += crlf;

    return outer;
}

/**生成d.ts定义 */
function makeDTS(blocks: Block[]){
    let tc = new TabCache();
    let outer = tc.v() + '// ' + (<any>blocks).rem + crlf + 'declare namespace protocol{' + crlf;
    tc.push();

    let printRem = (block: Member, ext = '')=>{
        if (block.rem && block.rem != ''){
            outer += tc.v() + '/**' + block.rem + ext + ' */' + crlf;
        }
    }

    let makeStruct = (block: Block, isProtocol = false)=>{
        outer += tc.v() + 'class ' + (block.parent ? block.parent.name + '_' : '') + block.name + '{' + crlf;
        tc.push();

        if (isProtocol){
            outer += tc.v() + 'static cmd: string;' + crlf; 
        }

        let ctorRem = '/**' + crlf;
        let ctor = 'constructor(_params_);';
        let params = '';
        for(let j = 0; j < block.members.length; j++){
            let member = block.members[j];
            printRem(member);
            outer += tc.v() + member.name + ': ' + typeMap.getJsType(member.type) + (member.isArray ? '[]':'') + ';' + crlf;
            params += member.name + ': ' + typeMap.getJsType(member.type) 
                + (member.isArray ? '[]':'') + (j < block.members.length - 1 ? ', ': '');
            
            ctorRem += tc.v() + '* @param ' + member.name + ' ' + member.rem + crlf;
        }

        ctorRem += tc.v() + '*/';

        outer += tc.v() + ctorRem + crlf;
        outer += tc.v() + ctor.replace('_params_', params) + crlf;
        tc.pop();
        outer += tc.v() + '}' + crlf;
    }

    for(let i = 0; i < blocks.length; i++){
        let block = blocks[i];
        
        printRem(block, ' type: ' + block.type);
        if (block.type == 'const'){

            outer += tc.v() + 'const ' + block.name + ' = ' + block.value + ';' + crlf;

        } else if (block.type == 'enum'){

            outer += tc.v() + 'enum ' + block.name + '{' + crlf;
            tc.push();

            for(let j = 0; j < block.members.length; j++){
                let member = block.members[j];
                printRem(member);
                outer += tc.v() + member.name + ' = ' + member.value + ',' + crlf;
            }

            tc.pop();
            outer += tc.v() + '}' + crlf;

        } else if (block.type == 'struct' || block.type == 'protocol'){
            if (block.request && block.reponse){
                printRem(block, 'request');
                makeStruct(block.request, true);
                printRem(block, 'response');
                makeStruct(block.reponse, true);
            }else {
                makeStruct(block, true);
            }
        } 
        outer += crlf;
    }

    tc.pop();
    outer += '}';

    return outer;
}

/**生成js协议 */
function makeProtocolJS(blocks: Block[]){
    let tc = new TabCache();
    let outer = '"use strict";' + crlf 
    outer += tc.v() + '// ' + (<any>blocks).rem + crlf + 'window.protocol = window.protocol || {};' + crlf;
    tc.push();

    // 输出成员的注释
    let printRem = (block: Member, ext = '')=>{
        if (block.rem && block.rem != ''){
            outer += tc.v() + '/**' + block.rem + ext + ' */' + crlf;
        }
    }
    
    // 生成结构体和协议结构体
    let makeStruct = (block: Block, isProtocol = false)=>{
        let struct = '';
        let blockName = (block.parent ? block.parent.name + '_' : '') + block.name;
        struct += tc.v() + 'protocol.' + blockName + ' = function(_params_){' + crlf;

        tc.push();

        let cmd = '';
        if (isProtocol){
            if (block.parent){
                cmd = block.parent.name + '.' + block.name; 
            } else {
                cmd = block.name;
            }
            struct += tc.v() +'this.cmd = protocol.' + blockName + '.cmd;' + crlf; 
        }

        let ctorParams = '';

        for(let j = 0; j < block.members.length; j++){
            let member = block.members[j];
            printRem(member);
            struct += tc.v() + 'this.' + member.name + ' = ' + member.name + ';' + crlf;;

            ctorParams += member.name + ' = ' + (member.isArray ? '[]' : typeMap.getDefault(member.type)) 
                + (j < block.members.length - 1 ? ', ' : '');
        }

        tc.pop();
        struct += tc.v() + '}' + crlf;
        struct = struct.replace('_params_', ctorParams);

        outer += struct;

        outer += tc.v() + 'protocol.' + blockName + '.cmd = "' + cmd + '";' + crlf;
    }

    for(let i = 0; i < blocks.length; i++){
        let block = blocks[i];
        
        printRem(block, ' type: ' + block.type);
        if (block.type == 'const'){

            outer += tc.v() + 'protocol.' + block.name + ' = ' + block.value + ';' + crlf;

        } else if (block.type == 'enum'){

            outer += tc.v() + 'protocol.' + block.name + ' = {' + crlf;
            tc.push();

            for(let j = 0; j < block.members.length; j++){
                let member = block.members[j];
                printRem(member);
                outer += tc.v() + member.name + ': ' + member.value + ',' + crlf;
            }

            tc.pop();
            outer += tc.v() + '}' + crlf;

        } else if (block.type == 'protocol' || block.type == 'struct'){
            if (block.reponse && block.request){
                printRem(block, 'request');
                makeStruct(block.request, true);
                printRem(block, 'response');
                makeStruct(block.reponse, true);

            } else {
                makeStruct(block, true);
            }

        }

        outer += crlf;
    }
    
    tc.pop();

    outer += crlf;
    return outer; 
}

/**生成c#协议 */
function makeProtocolCS(blocks: Block[]){
    // 缩进控制
    let tc = new TabCache();
    let outer = tc.v() + '// ' + (<any>blocks).rem + crlf + 'using System;' + crlf;
    outer += tc.v() + 'namespace protocol{' + crlf;
    tc.push();

    // 输出成员的注释
    let printRem = (block: Member, ext = '')=>{
        if (block.rem && block.rem != ''){
            outer += tc.v() + '/// ' + block.rem + ext + crlf;
        }
    }
    
    // 生成结构体和协议结构体
    let makeStruct = (block: Block, isProtocol = false)=>{
        let blockName = (block.parent ? block.parent.name + '_' : '') + block.name;

        outer += tc.v() + 'public class ' + blockName + '{' + crlf;
        tc.push();

        if (isProtocol){
            let cmd = '';
            if (block.parent){
                cmd = block.parent.name + '.' + block.name; 
            } else {
                cmd = block.name;
            }
            outer += tc.v() + 'public const string cmd = "' + cmd + '";' + crlf; 
        }

        let ctorSubject =  'public ' + blockName + '(_params_){' + crlf;
        let ctorParams = '';

        for(let j = 0; j < block.members.length; j++){
            let member = block.members[j];
            printRem(member);

            let mtype = typeMap.getCsType(member.type);
            if (member.isArray) mtype += '[]';

            outer += tc.v() + 'public ' + mtype + ' ' + member.name + ';' + crlf;

            tc.push();
            ctorSubject += tc.v() + 'this.' + member.name + ' = ' + member.name + ';' + crlf;
            tc.pop();

            let mvalue = typeMap.getDefault(member.type);
            if (member.isArray || mvalue.indexOf('(') > -1){
                mvalue = 'null';
            }
            ctorParams += mtype + ' ' + member.name + ' = ' + mvalue
                + (j < block.members.length - 1 ? ', ' : '');
        }

        outer += tc.v() + ctorSubject.replace('_params_', ctorParams) + crlf;
        outer += tc.v() + '}' + crlf;

        tc.pop();
        outer += tc.v() + '}' + crlf;
    }

    for(let i = 0; i < blocks.length; i++){
        let block = blocks[i];
        
        printRem(block, ' type: ' + block.type);
        if (block.type == 'const'){

            outer += tc.v() + 'public class ' + block.name + '{ public const '
                + typeMap.getCsType(block.constType) + ' v = ' + block.value + '; }' + crlf;

        } else if (block.type == 'enum'){

            outer += tc.v() + 'public enum ' + block.name + '{' + crlf;
            tc.push();

            for(let j = 0; j < block.members.length; j++){
                let member = block.members[j];
                printRem(member);
                outer += tc.v() + member.name + ' = ' + member.value + ',' + crlf;
            }

            tc.pop();
            outer += tc.v() + '}' + crlf;

        } else if (block.type == 'protocol' || block.type == 'struct'){
            if (block.reponse && block.request){
                printRem(block, 'request');
                makeStruct(block.request, true);
                printRem(block, 'response');
                makeStruct(block.reponse, true);

            } else {
                makeStruct(block, true);
            }

        }

        outer += crlf;
    }

    tc.pop();
    
    outer += tc.v() + '}' + crlf;

    return outer;
}

main();