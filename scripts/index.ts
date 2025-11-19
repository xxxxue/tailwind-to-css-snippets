import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const dirName = "snippets"

if (!existsSync(dirName)) {
  mkdirSync(dirName);
}

const input_path = "./scripts/tw.txt";
const output_path = `./${dirName}/snippets.code-snippets`;

const test_file_path = "./scripts/tw-test.txt";

main();

async function main() {
  const fs = createReadStream(input_path, { encoding: "utf-8" });
  const rl = createInterface({
    input: fs,
    crlfDelay: Infinity,
  });

  const resArr: string[] = [];

  // 逐行读取
  for await (const line of rl) {
    // 排除空行与行注释
    if (line.trim() == "" || line.startsWith("//")) {
      continue;
    }
    // 使用第一个空格分隔出 key value
    const arr: string[] = splitOnFirstSpace(line);
    if (arr[1] == "") {
      throw `格式错误:${line}`;
    }
    const name = arr[0].trim().replaceAll('"', '\\"');
    const code = arr[1].trim().replaceAll('"', '\\"');

    const desc = code.length > 20 ? name : code; // 过长的代码就用 名称 当备注

    // 使用 "换行" 来标识换行的位置
    const codeArr = code.split("换行");

    // 使用 "空格" 来标识最终的空格
    // 拼接字符串 (格式: "xxx","xxx" )
    let body = codeArr.map((v) => `"${v.trim().replaceAll("空格", " ")}"`).join(",");

    // 排除颜色值
    if (!name.startsWith("color-")) {
      // 给多行代码 添加名称注释
      if (codeArr.length > 1) {
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
          "${desc}": {
              "prefix": "${name}",
              "description": "${desc}",
              "scope": "css,less,scss",
              "body": [
                  ${body}
              ]
          }`;

    if (item.trim() != "") {
      resArr.push(item);
    }
  }

  // 拼接收尾大括号, 将所有内容转为 json
  let res = `{${resArr.join(",\n")}}`;

  writeFileSync(test_file_path, res, { encoding: "utf-8" }); // 写入测试文件,便于查看 json 格式错误

  // 格式化 JSON
  res = JSON.stringify(JSON.parse(res), null, 2);

  // 保存到 snippets 文件夹中, 可以直接进行调试与打包
  writeFileSync(output_path, res, { encoding: "utf-8" });

  console.log("end");
}

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
