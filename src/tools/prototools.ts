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
    default: ['0', '0', '0', '0', '0', '0', '0', '0', '\'\'', 'false'],

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
    }
}

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

class Block extends Member{
    members: Member[]; 
    request: Block|null;
    reponse: Block|null;
    parent: Block|null;
    constructor(name = '', type = '', line = -1, rem = ''){
        super(rem, name, type, line);
        this.members = [];
        this.request = null;
        this.reponse = null;
        this.parent = null;
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
        return a.typeCost() - b.typeCost();
    });

    (<any>blocks).rem = protocolRem;
    return blocks;
}

function main(){
    let config = parseArgs();

    if (config.inputFile == '' || config.outputFile == ''){
        console.log('param wrong.\r\nuse node prototool.js -i xxx -o xxx');
        return;
    }

    let blocks = parse(config.inputFile, {});
    if (blocks){
        let protocol: string|null = null;
        switch(config.type){
            case 'cs':
                //protocol = makeProtocolCS(blocks);
            break;

            case 'ts':
                protocol = makeProtocolTS(blocks);
            break;

            case 'js':
                //protocol = makeProtocolJS(blocks);
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
            console.log('build protocol ok!');
        }
    }
}

/**生成ts协议 */
function makeProtocolTS(blocks: Block[]): string|null{
    // 缩进控制
    let tc = new TabCache();
    let outer = tc.v() + (<any>blocks).rem + crlf;

    // 输出成员的注释
    let printRem = (block: Member)=>{
        if (block.rem && block.rem != ''){
            outer += tc.v() + '/**' + block.rem + ' */' + crlf;
        }
    }
    
    // 生成结构体和协议结构体
    let makeStruct = (block: Block, isProtocol = false, isInside = false)=>{
        if (!isInside){
            outer += tc.v() + 'export class ' + block.name + '{' + crlf;
        } else {
            outer += tc.v() + block.name + ': class{' + crlf;
        }
        tc.push();

        if (isProtocol){
            let cmd = '';
            if (isInside && block.parent){
                cmd = block.parent.name + '.' + block.name; 
            } else {
                cmd = block.name;
            }
            outer += tc.v() + 'static cmd = \'' + cmd + '\';' + crlf; 
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

            ctorParams += member.name + ' = ' + (member.isArray ? '[]' : typeMap.getDefault(member.type)) 
                + (j < block.members.length - 1 ? ', ' : '');
        }

        outer += tc.v() + ctorSubject.replace('_params_', ctorParams) + crlf;
        outer += tc.v() + '}' + crlf;

        tc.pop();
        outer += tc.v() + '}' + (isInside ? ',' : '') + crlf;
    }

    for(let i = 0; i < blocks.length; i++){
        let block = blocks[i];
        
        printRem(block);
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

        } else if (block.type == 'struct'){
            makeStruct(block);

        } else if (block.type == 'protocol'){
            if (block.reponse && block.request){

                outer += tc.v() + 'export const ' + block.name + ' = {' + crlf;
                tc.push();
                outer += tc.v() + 'cmd: \'' + block.name + '.req\',' + crlf;
                
                makeStruct(block.request, true, true);
                makeStruct(block.reponse, true, true);

                tc.pop();
                outer += tc.v() + '}' + crlf;

            } else {
                makeStruct(block, true);
            }

        }

        outer += crlf;
    }

    outer += crlf;

    return outer;
}

function makeDTS(blocks: Block[]){
    let tc = new TabCache();
    let outer = tc.v() + (<any>blocks).rem + crlf + 'declare namespace protocol{' + crlf;
    tc.push();

    let printRem = (block: Member)=>{
        if (block.rem && block.rem != ''){
            outer += tc.v() + '/**' + block.rem + ' */' + crlf;
        }
    }

    let makeStruct = (block: Block, isProtocol = false, isInside = false)=>{
        outer += tc.v() + 'class ' + block.name + '{' + crlf;
        tc.push();

        if (isProtocol){
            outer += tc.v() + 'static cmd: string;' + crlf; 
        }

        let ctor = 'constructor(_params_);';
        let params = '';
        for(let j = 0; j < block.members.length; j++){
            let member = block.members[j];
            printRem(member);
            outer += tc.v() + member.name + ': ' + typeMap.getJsType(member.type) + (member.isArray ? '[]':'') + ';' + crlf;
            params += member.name + ': ' + typeMap.getJsType(member.type) 
                + (member.isArray ? '[]':'') + (j < block.members.length - 1 ? ', ': '');
        }

        outer += tc.v() + ctor.replace('_params_', params) + crlf;
        tc.pop();
        outer += tc.v() + '}' + crlf;
    }

    for(let i = 0; i < blocks.length; i++){
        let block = blocks[i];
        
        printRem(block);
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

        } else if (block.type == 'struct'){
            makeStruct(block);

        } else if (block.type == 'protocol'){
            if (block.request && block.reponse){
                outer += tc.v() + 'namespace ' + block.name + '{' + crlf;
                tc.push();

                outer += tc.v() + 'const cmd = \'' + block.name + '.req\';' + crlf;
                makeStruct(block.request, true, true);
                makeStruct(block.reponse, true, true);
                tc.pop();

                outer += tc.v() + '}' + crlf;
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

function makeProtocolJS(blocks: Block[]){
    let tc = new TabCache();
    let outer = tc.v() + (<any>blocks).rem + crlf + 'globa.protocol = globa.protocol || {};' + crlf;
    tc.push();

    // 输出成员的注释
    let printRem = (block: Member)=>{
        if (block.rem && block.rem != ''){
            outer += tc.v() + '/**' + block.rem + ' */' + crlf;
        }
    }
    
    // 生成结构体和协议结构体
    let makeStruct = (block: Block, isProtocol = false, isInside = false)=>{
        if (!isInside){
            outer += tc.v() + 'global class ' + block.name + '{' + crlf;
        } else {
            outer += tc.v() + block.name + ': class{' + crlf;
        }
        tc.push();

        if (isProtocol){
            let cmd = '';
            if (isInside && block.parent){
                cmd = block.parent.name + '.' + block.name; 
            } else {
                cmd = block.name;
            }
            outer += tc.v() + 'static cmd = \'' + cmd + '\';' + crlf; 
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

            ctorParams += member.name + ' = ' + (member.isArray ? '[]' : typeMap.getDefault(member.type)) 
                + (j < block.members.length - 1 ? ', ' : '');
        }

        outer += tc.v() + ctorSubject.replace('_params_', ctorParams) + crlf;
        outer += tc.v() + '}' + crlf;

        tc.pop();
        outer += tc.v() + '}' + (isInside ? ',' : '') + crlf;
    }

    for(let i = 0; i < blocks.length; i++){
        let block = blocks[i];
        
        printRem(block);
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

        } else if (block.type == 'struct'){
            makeStruct(block);

        } else if (block.type == 'protocol'){
            if (block.reponse && block.request){

                outer += tc.v() + 'export const ' + block.name + ' = {' + crlf;
                tc.push();
                outer += tc.v() + 'cmd: \'' + block.name + '.req\',' + crlf;
                
                makeStruct(block.request, true, true);
                makeStruct(block.reponse, true, true);

                tc.pop();
                outer += tc.v() + '}' + crlf;

            } else {
                makeStruct(block, true);
            }

        }

        outer += crlf;
    }
    
        

    tc.pop();
    outer += '}';

    outer += crlf;
    return outer; 
}

main();