import { Node, MethodDeclaration, PropertyAssignment, createWrappedNode, ts, FunctionExpression, ArrowFunction } from 'ts-morph'
import fs from 'fs'
import path from 'path'
export interface Docs {
  before: string[]
  after: string[]
}
export function getDocs(node: Node): Docs {
  let docs: Docs = { before: [], after: [] }
  docs.before = node.getLeadingCommentRanges().map(item => {
    return item.getText()
  })
  docs.after = node.getTrailingCommentRanges().map(item => {
    return item.getText()
  })
  return docs
}

export function removeQuote(str: string): string {
  return str.replace(/^['"`]([^]*)['"`]$/, `$1`)
}
export function capitalize(str: string): string {
  let firstChar = str.substr(0, 1)
  if (firstChar.match(/a-z/)) {
    return firstChar.toUpperCase() + str.substr(1)
  } else {
    return str
  }
}

export function fileDisplay(filePath: string, callback: (filedir: string) => void) {
  return new Promise((resolve, reject) => {
    readdir(filePath, callback, reject)
    resolve()
  })
}

export function getCorrectFunction(node: Node | undefined): MethodDeclaration | FunctionExpression | ArrowFunction | undefined {
  if (Node.isMethodDeclaration(node)) {
    return node
  }
  if (Node.isArrowFunction(node)) {
    return node
  }
  if (Node.isPropertyAssignment(node)) {
    let initializer = node.getInitializer()
    if (Node.isFunctionExpression(initializer)) {
      return initializer
    }
  }
}

function readdir(filePath: string, callback: (filedir: string) => void, reject: (reason?: any) => void) {
  let _filename
  try {
    let files = fs.readdirSync(filePath)
    files.map(filename => {
      var filedir = path.join(filePath, filename)
      _filename = filename
      let stats = fs.statSync(filedir)
      var isFile = stats.isFile()
      var isDir = stats.isDirectory()
      if (isFile) {
        callback(filedir)
      }
      if (isDir) {
        readdir(filedir, callback, reject)
      }
    })
  }
  catch (e) {
    reject(e + '>>>>>>>>>' + filePath + _filename)
  }

}