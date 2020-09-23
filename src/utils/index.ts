import { Node } from 'ts-morph'
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

export function fileDisplay(filePath: string, callback: (filedir: string) => void) {
  return new Promise((resolve, reject) => {
    readdir(filePath, callback, reject)
    resolve()
  })
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