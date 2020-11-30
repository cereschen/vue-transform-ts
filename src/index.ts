import { Project, SourceFile } from 'ts-morph'
import fs from 'fs-extra'
import path from 'path'
import { fileDisplay } from './utils'
import { transformScript } from './transform'

export function transform(rootPath: string, outPath?: string) {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true, jsx: 1 } })
  if (!outPath) outPath = rootPath + 'Ts'
  fileDisplay(rootPath, (file) => {
    if (!outPath) return;
    let isVue = file.match(/.*\.vue$/s)
    let needTransform = false
    let sf!: SourceFile
    let match
    let result
    if (isVue) {
      // console.log('processing: ' + file)
      let allText = fs.readFileSync(file, 'utf-8').toString()
      match = allText.match(/([^]*<\s*script)(\s*[^]*?)(>[\r\n\s]*)(?<script>[^]*)([\r\n\s]*<\/\s*script\s*>[^]*)/)
      if (!match) return
      sf = project.createSourceFile(file + '.script.tsx', match.groups?.script)
      result = transformScript(sf, rootPath, true)
    } else if (file.match(/(?:mixin)[^]*\.(jsx?|tsx?)$/i)) {
      needTransform = true
      // console.log('processing: ' + file)
      let allText = fs.readFileSync(file, 'utf-8').toString()
      sf = project.createSourceFile(file, allText)
      result = transformScript(sf, rootPath)

    } else {
      let allText = fs.readFileSync(file, 'utf-8').toString()
      sf = project.createSourceFile(file, allText)
      // let filePath = path.relative(rootPath, sf.getFilePath())
      // let fileName = sf.getBaseName()
      // fs.ensureFileSync(path.join(outPath, filePath, '../', fileName))
      // fs.writeFileSync(path.join(outPath, filePath, '../', fileName), sf.getText())
    }
    if (!sf) return
    if (!fs.existsSync(outPath)) fs.mkdirSync(outPath)
    if (isVue) {
      if (!match) return
      let filePath = path.relative(rootPath, sf.getFilePath())
      let fileName = sf.getBaseName().replace(/\.script\.tsx?$/, '')
      fs.ensureFileSync(path.join(outPath, filePath, '../', fileName))
      fs.writeFileSync(path.join(outPath, filePath, '../', fileName), match[1] + (match[2].trim() ? match[2] : ` lang="ts"`) + match[3] + sf.getText() + match[5])
    } else {
      let filePath = path.relative(rootPath, sf.getFilePath())
      let fileName = sf.getBaseName().replace(/\.js$/, needTransform ? '.ts' : '.js')
      fs.ensureFileSync(path.join(outPath, filePath, '../', fileName))
      fs.writeFileSync(path.join(outPath, filePath, '../', fileName), sf.getText())
    }
  })

  console.log('All done!')
}


