import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const dirName = "snippets";

if (!existsSync(dirName)) {
  mkdirSync(dirName);
}

const _inputPath = "./scripts/tw.txt";
const _outputPath = `./${dirName}/snippets.code-snippets`;
const _testFilePath = "./scripts/tw-test.txt";

const _resArr: string[] = [];
const _catchKeyArr: string[] = [];
let _hasError = false;
const _catchDescArr: string[] = [];
let _index = 0;

main();

async function main() {
  const fs = createReadStream(_inputPath, { encoding: "utf-8" });
  const rl = createInterface({
    input: fs,
    crlfDelay: Infinity,
  });

  // 用于 多行模式 保存当前数据, 用完需要重置
  let currentKey = "";
  let currentCodeArr = [];
  let isWaitEnd = false;

  // 逐行读取
  for await (const line of rl) {
    // 排除空行与行注释
    if (line.trim() == "" || line.startsWith("//")) {
      continue;
    }
    // 多行模式
    if (currentKey.trim() != "") {
      if (line.trim() == "```") {
        // 开始多行模式
        if (!isWaitEnd) {
          isWaitEnd = true;
          continue;
        } else {
          create(currentKey, currentCodeArr);
          // 多行模式 结束
          currentKey = "";
          currentCodeArr.length = 0;
          isWaitEnd = false;
          continue;
        }
      }
      // 保存当前行的代码
      currentCodeArr.push(line.replaceAll('"', '\\"'));
      continue;
    } else {
      // 单行模式
      // 使用第一个空格分隔出 key value
      const arr: string[] = splitOnFirstSpace(line);

      if (arr[1].trim() == "") {
        // 只有一个参数, 那就是 多行模式的 key 名称
        // 开启多行模式
        if (currentKey.trim() == "") {
          currentKey = arr[0].trim().replaceAll('"', '\\"');
          continue;
        }
        throw "无效行:" + line;
      }

      const name = arr[0].trim().replaceAll('"', '\\"');
      const code = arr[1].trim().replaceAll('"', '\\"');
      // 单行模式支持 __NL__ (换行) 与 __SP__ (空格)
      create(name, code);
      continue;
    }
  }

  if (_hasError) {
    console.error("有错误,停止生成文件");
    return;
  }
  writeToFile();
  console.log("end");
}

/** 将整个代码片段的数据, 全部保存到 JSON 文件 */
function writeToFile() {
  // 拼接首尾大括号, 将所有内容转为 json
  let res = `{${_resArr.join(",\n")}}`;

  try {
    // 格式化 JSON
    res = JSON.stringify(JSON.parse(res), null, 2);

    // 保存到 snippets 文件夹中, 可以直接进行调试与打包
    writeFileSync(_outputPath, res, { encoding: "utf-8" });
  } catch (error) {
    console.error(error);
    writeFileSync(_testFilePath, res, { encoding: "utf-8" }); // 写入测试文件,便于查看 json 格式错误
  }
}

/** 通过 name 和 code 创建代码片段 */
function create(name: string, code: string | string[]): void {
  if ((typeof code == "string" && code.trim() == "") || (Array.isArray(code) && code.length == 0)) {
    throw "代码为空:" + name;
  }
  let desc = name;

  if (typeof code == "string" && code.length < 30) {
    // 代码较短, 就用来做 desc
    desc = code;
  }

  let codeArr: string[] = [];
  if (typeof code == "string") {
    codeArr = code.split("__NL__");
  } else if (Array.isArray(code)) {
    codeArr = code;
  }

  // 用 desc 当做 json 的 key 名称
  // (会显示在 自动补全的项 右侧,充当一个短详情的效果)
  let keyName = desc;

  // 如果重复, 添加唯一标识
  // 因为 JSON.parse 会把 相同 key 覆盖掉, 导致某些代码片段消失
  if (_catchDescArr.includes(desc)) {
    _index++;
    keyName = desc + "_" + _index;
  }

  // 拼接字符串 (格式: "xxx","xxx" )
  let body = "";
  if (typeof code == "string") {
    // 单行代码 移除两侧空格
    body = codeArr.map((v) => `"${v.trim().replaceAll("__SP__", " ")}"`).join(",");
  } else {
    //多行代码 保留左侧空格
    body = codeArr.map((v) => `"${v.trimEnd()}"`).join(",");
  }

  // 排除颜色值
  if (!name.startsWith("color-")) {
    // 给 "space-" 添加注释
    if (name.startsWith("space-")) {
      body = `"/* ${name} */",${body}`;
    }
    // 不包含 ${0} 最终位置,则在末尾添加最终位置
    if (!body.includes("${0}")) {
      body = `${body},"\${0}"`;
    }
  }

  // key 名称: 选项右侧的备注,
  // prefix: 选项的内容,同时也是 vscode 关键字匹配的内容
  // description: 右侧新弹窗中的标题
  // scope: 设置这个片段会在哪种语言中生效,
  //  如果不写 scope, 就需要在 package.json 同时设置 language 与 path.
  //  否则会全局生效(一般也没有适用于全局的片段)
  //  指定 scope, 则只需要设置 path
  // body: 代码补全的结果, 同时也是 右侧新弹窗中的内容
  let item = `
          "${keyName}": {
              "prefix": "${name}",
              "description": "${desc}",
              "scope": "css,less,scss",
              "body": [
                  ${body}
              ]
          }`;

  if (item.trim() != "") {
    if (_catchKeyArr.includes(name)) {
      // 检查重复 key
      console.error(`key 重复: ${name}`);
      _hasError = true; // 不直接停止,而是全部检查后,得到所有结果,再停止
    } else {
      // 一切正常
      _resArr.push(item);
      _catchKeyArr.push(name);
      _catchDescArr.push(desc);
    }
  }
}

/** 分割字符串, 使用第一个空格作为分隔符, 剩余文本全放在第二个位置 */
function splitOnFirstSpace(str: string) {
  // 找到第一个空格的位置
  const firstSpaceIndex = str.indexOf(" ");

  if (firstSpaceIndex === -1) {
    // 如果没有空格，整个字符串作为第一部分，第二部分为空字符串
    return [str, ""];
  } else {
    // 截取第一部分：从开头到第一个空格之前
    const firstPart = str.slice(0, firstSpaceIndex);
    // 截取第二部分：从第一个空格之后到字符串末尾
    const secondPart = str.slice(firstSpaceIndex + 1);
    return [firstPart, secondPart];
  }
}

// (不在代码中调用) 浏览器中获取 表格中的数据
function a() {
  // 在浏览器控制台中执行下面代码获取到 tw 表格数据,直接粘贴到 tw.txt 中 ( 适用于 tailwind v3, 还没测试 v4 )
  let res = [];
  let dom = document.getElementsByTagName("tbody")[0];
  if (dom != undefined) {
    let list = dom.childNodes;
    for (const item of list) {
      let arr = item.childNodes;
      let name = arr[0].textContent?.trim();
      let code = arr[1].textContent?.trim().replaceAll("\n", "__NL__");
      res.push(`${name} ${code}`);
    }
    let resText = res.join("\n");
    console.log(resText);
  } else {
    console.error("未找到 tbody 元素");
  }
}
