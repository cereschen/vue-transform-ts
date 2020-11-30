
import { Docs, getDocs, capitalize, removeQuote, getCorrectFunction } from '../utils'
import { ts, Node, SourceFile, ObjectLiteralElementLike, ObjectLiteralExpression } from 'ts-morph'
const { SyntaxKind } = ts
import fs from 'fs'
import path from 'path'
export function transformScript(sf: SourceFile, rootPath: string, isVue?: boolean) {
  interface DataMember {
    name: string
    initializer: string
    docs: Docs
    type: string
    inConstructor: boolean
  }
  let dataMembers: DataMember[] = []
  let ignoredDataMembers: ObjectLiteralElementLike[] = []
  let defaultExport = sf.getDefaultExportSymbol()?.getDeclarations()[0]
  if (!defaultExport) return
  let obj: ObjectLiteralExpression | undefined
  obj = defaultExport.getFirstChildByKind(SyntaxKind.ObjectLiteralExpression)
  if (!obj) {
    obj = defaultExport.getFirstChildByKind(SyntaxKind.CallExpression)?.getFirstChildByKind(SyntaxKind.ObjectLiteralExpression)
  }
  if (!obj) return;


  let data = obj.getProperty('data')
  let othersDataStatement: string[] = []
  if (Node.isMethodDeclaration(data)) {
    let body = data.getBody()
    if (Node.isBlock(body)) {
      body.getStatements().map(item => {

        if (!Node.isReturnStatement(item)) {
          othersDataStatement.push(item.getText())
        }
      })
    }
    let dataReturn = data.getFirstDescendantByKind(SyntaxKind.ReturnStatement)
    let dataObj = dataReturn?.getFirstChildByKind(SyntaxKind.ObjectLiteralExpression)

    dataObj?.getProperties().map(item => {
      if (Node.isPropertyAssignment(item) || Node.isShorthandPropertyAssignment(item)) {
        let name = removeQuote(item.getSymbol()?.getName()!)
        let initializerText
        let docs: Docs
        let type = item.getType().getText()
        let inConstructor = false
        if (type.match(/(undefined|never)/)) type = 'any'
        const initializer = item.getInitializer()
        initializerText = initializer?.getText()
        if (!initializer || Node.isIdentifier(initializer)) {
          if (!initializer) {
            initializerText = name
          }
          // inConstructor = true
        }
        docs = getDocs(item)
        if (name && initializerText && type) {
          dataMembers.push({ name, initializer: initializerText, docs, type, inConstructor })
        }
      } else {
        ignoredDataMembers.push(item)
      }
    })
  }

  let methods = obj.getProperty('methods')
  let methodsObj = methods?.getLastChildIfKindOrThrow(SyntaxKind.ObjectLiteralExpression)
  interface MethodsMember {
    text: string
    docs: Docs
  }
  let methodsMembers: MethodsMember[] = []
  let ignoredMethodsMembers: ObjectLiteralElementLike[] = []
  methodsObj?.getProperties().map(item => {

    if (Node.isMethodDeclaration(item) || Node.isPropertyAssignment(item)) {
      let text = item.getText()
      if (Node.isPropertyAssignment(item)) {
        text = item.getNodeProperty("initializer").getText().replace(/^function/, removeQuote(item.getName()))
      }
      let docs: Docs
      docs = getDocs(item)
      methodsMembers.push({ text, docs })
    } else {
      ignoredMethodsMembers.push(item)
    }
  })




  let computed = obj.getProperty('computed')
  let computedObj = computed?.getLastChildIfKindOrThrow(SyntaxKind.ObjectLiteralExpression)
  interface ComputedMember extends MethodsMember { }

  let computedMembers: ComputedMember[] = []
  let ignoredComputedMembers: ObjectLiteralElementLike[] = []
  let computedObjMembers: ComputedMember[] = []

  computedObj?.getProperties().map(item => {

    if (Node.isMethodDeclaration(item) || Node.isPropertyAssignment(item)) {
      let text = item.getText()
      let docs: Docs
      docs = getDocs(item)
      if (Node.isPropertyAssignment(item)) {
        let initializer = item.getInitializer()
        if (Node.isObjectLiteralExpression(initializer)) {
          let get = initializer.getProperty('get')
          let getText = ''
          let set = initializer.getProperty('set')
          let setText = ''

          if (Node.isMethodDeclaration(get)) {
            getText = `get ` + get.getText().replace(/^get/, removeQuote(item.getName())) + '\n'
          }
          if (Node.isPropertyAssignment(get)) {
            getText = `get ` + get.getNodeProperty("initializer").getText().replace(/^function/, removeQuote(item.getName())) + '\n'
          }
          if (Node.isMethodDeclaration(set)) {
            setText = `set ` + set.getText().replace(/^set/, removeQuote(item.getName())) + '\n'
          }
          if (Node.isPropertyAssignment(set)) {
            setText = `set ` + set.getNodeProperty("initializer").getText().replace(/^function/, removeQuote(item.getName())) + '\n'
          }


          let objText = getText + setText
          computedObjMembers.push({ docs, text: objText })
          return
        }

        text = item.getNodeProperty("initializer").getText().replace(/^function/, removeQuote(item.getName()))
      }

      computedMembers.push({ text, docs })
    } else {
      ignoredComputedMembers.push(item)
    }
  })

  let props = obj.getProperty('props')
  let propsArray = props?.getLastChildIfKind(SyntaxKind.ArrayLiteralExpression)
  let propsObj = props?.getLastChildIfKind(SyntaxKind.ObjectLiteralExpression)
  interface PropsMember extends MethodsMember {
    name: string
    type: string
    required: boolean

    defaultValue?: string
  }

  let propsMembers: PropsMember[] = []
  propsObj?.getProperties().map(item => {

    if (Node.isPropertyAssignment(item)) {
      let value = item.getNodeProperty('initializer')
      let type: string = ''
      let text: string = ''
      let required = false
      let defaultValue = ''
      let name = removeQuote(item.getName())
      if (Node.isObjectLiteralExpression(value)) {
        text = value.getText()
        let _type = value.getProperty('type')
        if (Node.isPropertyAssignment(_type)) {
          type = _type.getNodeProperty("initializer").getText() || ''
        }
        required = value.getProperty('required')?.getText() === 'true' || false
        let _default = value.getProperty('default')


        if (_default) {
          let fn = getCorrectFunction(_default)
          if (fn && !type.includes('Function')) {
            type = fn.getReturnType().getText()
          } else {
            type = _default.getType().getText()
          }
          defaultValue = 'hasDefaultValue'
        }

        if (Node.isPropertyAssignment(_default)) {
          defaultValue = _default.getNodeProperty('initializer').getText() || ''
        }



      } else {
        type = item.getNodeProperty('initializer').getText()
        text = `{type:${type}}`
      }

      let docs = getDocs(item)
      type = type.replace(/String|Object|Number|Promise|Boolean|Symbol/g, (val) => {
        return val.toLowerCase()
      })
      type = type.replace(/Array/g, 'unknown[]')

      /* @ts-ignore */
      type = type.replace(/\[([^]+)\]/, (val, $1: string) => {
        return $1.replace(/,/g, ' | ')
      })

      propsMembers.push({ docs, text, name, type, required, defaultValue })
    }

  })
  let propsArrayMembers: string[] | undefined = propsArray?.getElements().map(item => {
    return item.getText()
  })

  let watch = obj.getProperty('watch')
  let watchObj = watch?.getLastChildIfKind(SyntaxKind.ObjectLiteralExpression)
  interface WatchMember extends MethodsMember {
    target: string
    options: (string | undefined)[]
  }

  let watchMembers: WatchMember[] = []
  let ignoredWatchMembers: ObjectLiteralElementLike[] = []
  watchObj?.getProperties().map(item => {
    if (Node.isMethodDeclaration(item)) {
      let target = item.getName()
      let match = target.match(/^['"`]([^]*)['"`]$/)
      if (match) target = match[1]
      let name = `on${capitalize(target)}Change`
      let docs = getDocs(item)
      item.rename(name)
      let text = item.getText()
      let options: (string | undefined)[] = []
      watchMembers.push({ text, target, docs, options })

    } else if (Node.isPropertyAssignment(item)) {

      let obj = item.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression)
      let handler = obj?.getProperty('handler')
      if (obj && Node.isMethodDeclaration(handler)) {
        let target = removeQuote(handler.getName())
        let match = target.match(/^['"`]([^]*)['"`]$/)
        if (match) target = match[1]
        let name = `on${capitalize(target).replace(/\./g, `_`)}Change`
        let docs = getDocs(item)
        handler.rename(name)
        let text = handler.getText()
        let immediate = obj.getProperty('immediate')?.getText()

        let deep = obj.getProperty('deep')?.getText()
        let options = []
        immediate && options.push(immediate)
        deep && options.push(deep)
        watchMembers.push({ text, target, docs, options })
      } else {
        let functionExpression = item.getInitializerIfKind(SyntaxKind.FunctionExpression)
        if (functionExpression) {
          let target = removeQuote(item.getName())
          let name = `on${capitalize(target).replace(/\./g, `_`)}Change`
          let text = functionExpression.getText().replace(/^function/, name)
          let docs = getDocs(item)
          let options: (string | undefined)[] = []
          watchMembers.push({ text, target, docs, options })
        } else {
          ignoredWatchMembers.push(item)
        }
      }
    } else {
      ignoredWatchMembers.push(item)
    }
  })

  let mixins = obj.getProperty('mixins')
  let mixinMembers: string[] = []
  if (Node.isPropertyAssignment(mixins)) {
    let value = mixins.getNodeProperty("initializer")
    if (Node.isArrayLiteralExpression(value)) {
      mixinMembers = value.getElements().map(item => {
        return item.getText()
      })
    }
  }
  sf.getImportStringLiterals().map(item => {
    let originalPath = item.getLiteralText()
    let matchAlias = originalPath.match(/^@([^]*)/)
    if (matchAlias) {
      originalPath = path.join(rootPath, matchAlias[1])

      // originalPath = path.relative(sf.getFilePath(), originalPath)
    }
    // let importPath = path.resolve(sf.getFilePath(), originalPath.match(/\.\//) ? '../' : '', originalPath)
    let match = originalPath.match(/\.(vue|ts|js)$/)
    if (!match && isVue) {
      console.log(path.join(originalPath, '/index.vue'))
      if (fs.existsSync(originalPath + '.vue')) {
        item.replaceWithText(`'${item.getLiteralText()}.vue'`)
      } else if (fs.existsSync(path.join(originalPath, '/index.vue'))) {
        item.replaceWithText(`'${item.getLiteralText()}/index.vue'`)
      }
      // Suffixes for TS files do not seem to be needed
      // if (fs.existsSync(originalPath + '.js')) {
      //   item.replaceWithText(`'${item.getLiteralText()}.ts'`)
      // }
    }
  })
  // Don't deal with it for the moment

  // let components = obj.getProperty('components')
  // let componentMembers: string[] = []
  // if (Node.isPropertyAssignment(components)) {
  //   let value = components.getNodeProperty("initializer")
  //   if (Node.isObjectLiteralExpression(value)) {
  //     componentMembers = value.getProperties().map(item => {
  //       // Node.isPropertyAssignment(item) ||
  //       if ( Node.isShorthandPropertyAssignment(item)) {

  //         let value = item.getLastChildIfKind(SyntaxKind.Identifier)
  //       }

  //       return item.getText()
  //     })
  //   }
  // }


  let others: string[] = []
  ignoredDataMembers.length && others.push(`data(){
    return { ${ignoredDataMembers.map(item => item.getText()).join(', ')} }
  }`)
  ignoredMethodsMembers.length && others.push(`methods:{
     ${ignoredMethodsMembers.map(item => item.getText()).join(',\n')}
  }`)
  ignoredWatchMembers.length && others.push(`watch:{
    ${ignoredWatchMembers.map(item => item.getText()).join(',\n')}
 }`)
  ignoredComputedMembers.length && others.push(`computed:{
  ${ignoredComputedMembers.map(item => item.getText()).join(',\n')}
}`)
  interface LifeCycleMember extends MethodsMember { }
  let lifeCycleMembers: LifeCycleMember[] = []

  obj.getProperties().map(item => {
    let name = item.getSymbol()?.getName()
    if (!name) return
    if (['created', 'beforeMount', 'mounted', 'beforeCreate', 'beforeUpdate', 'updated', 'activated', 'deactivated', 'beforeDestroy', 'destroyed', 'setup'].includes(name)) {
      let docs = getDocs(item)
      lifeCycleMembers.push({ text: item.getText(), docs })
    } else if (!['data', 'props', 'methods', 'computed', 'mixins', 'watch'].includes(name)) {
      others.push(item.getText())
    }
  })

  sf.removeDefaultExport()
  let NeedToImports: string[] = ['Component'];
  (propsMembers.length || propsArrayMembers?.length) && NeedToImports.push('Prop')
  watchMembers.length && NeedToImports.push('Watch')
  NeedToImports.push(mixinMembers.length ? 'Mixins' : 'Vue')

  let baseName = sf.getBaseName().split('.')[0]
  let isFirstCharNumber = baseName.substr(0, 1).match(/\d/)
  if (!isFirstCharNumber) {
    baseName = capitalize(baseName)
  }
  /* @ts-ignore */
  baseName = baseName.replace(/[-_]([A-z])/g, (val, $1: string) => {
    return $1.toLocaleUpperCase()
  })

  sf.addImportDeclaration({ moduleSpecifier: 'vue-property-decorator', namedImports: NeedToImports })
  sf.addStatements([...othersDataStatement])
  let defaultClass = sf.addClass({
    name: isFirstCharNumber ? 'Page' + baseName : baseName, isDefaultExport: true, extends: mixinMembers.length ? 'Mixins(' + mixinMembers.join(',') + ')' : 'Vue',
    decorators: [{ name: 'Component', arguments: others.length ? ['{\n' + others.join(',\n') + '\n}'] : undefined }]
  })
  let inConstructorDatas: DataMember[] = []
  defaultClass.addMember((writer) => {
    propsMembers.map((item, index) => {
      if (index !== 0) writer.newLine()
      item.docs.before.length && writer.write(item.docs.before.join('\n') + '\n')
      // The type is not easy to deal with
      // :${item.type.toLocaleLowerCase()}
      writer.write(`@Prop(${item.text})${item.text ? '\n' : ''} readonly ${item.name}${item.defaultValue || item.required ? '!' : ''} : ${item.type} ${item.docs.after.join(' ')} ;`)
    })
    propsArrayMembers?.map(item => {
      writer.newLine()
      writer.write(`@Prop() ${item.match(/^['"`]([^]*)['"`]$/)?.[1]}  ;`)
    })
    writer.blankLineIfLastNot()
    // 需要解决类型过长的问题 暂时取消  :${item.type}
    dataMembers.map((item, index) => {
      if (index !== 0) writer.newLine()
      item.docs.before.length && writer.write(item.docs.before.join('\n') + '\n')
      if (!item.inConstructor) {
        writer.write(`public ${item.name} = ${item.initializer}; ${item.docs.after.join(' ')}`)
      } else {
        inConstructorDatas.push(item)
        // writer.write(`${item.name}; ${item.docs.after.join(' ')}`)
      }
    })
    writer.blankLineIfLastNot()
  })

  inConstructorDatas.length && defaultClass.addConstructor({
    statements: ['super()', ...othersDataStatement, (writer) => {
      inConstructorDatas.map(item => {
        writer.newLine()
        writer.write(`this.${item.name} = ${item.initializer};`)
      })
    }]
  })

  defaultClass.addMember((writer) => {
    computedMembers.map(item => {
      writer.blankLineIfLastNot()
      if (item.docs.before.length) writer.write(item.docs.before.join('\n'))
      writer.newLine()
      writer.write('get ' + item.text)
    })
    computedObjMembers.map(item => {
      writer.blankLineIfLastNot()
      if (item.docs.before.length) writer.write(item.docs.before.join('\n'))
      writer.newLine()
      writer.write(item.text)
    })


    lifeCycleMembers.map(item => {
      writer.blankLineIfLastNot()
      if (item.docs.before.length) writer.write(item.docs.before.join('\n'))
      writer.newLine()
      writer.write(`protected ` + item.text)
    })

    methodsMembers.map((item) => {

      writer.blankLineIfLastNot()
      if (item.docs.before.length) writer.write(item.docs.before.join('\n'))
      writer.newLine()
      writer.write(`public ` + item.text)
    })

    watchMembers.map(item => {
      let options = item.options.length ? `, { ${item.options.join(', ')} }` : ''
      writer.blankLineIfLastNot()
      if (item.docs.before.length) writer.write(item.docs.before.join('\n'))
      writer.newLine()
      writer.write(`@Watch('${item.target}'${options})`)
      writer.newLine()
      writer.write(item.text)
    })
  })

  return true
}
