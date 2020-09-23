
import { Docs, getDocs } from '../utils'
import { ts, Node, SourceFile, ObjectLiteralElementLike } from 'ts-morph'
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
  let obj = defaultExport.getFirstChildByKind(SyntaxKind.ObjectLiteralExpression)
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
        let name = item.getSymbol()?.getName()
        let initializer
        let docs: Docs | undefined
        let type = item.getType().getText()
        let inConstructor = false
        if (type.match(/undefined/)) type = 'any'
        if (Node.isIdentifier(item.getInitializer())) {
          inConstructor = true
        }
        docs = getDocs(item)
        initializer = item.getInitializer()?.getText()
        if (name && initializer && docs && type) {
          dataMembers.push({ name, initializer, docs, type, inConstructor })
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

    if (Node.isMethodDeclaration(item)) {
      let text = item.getText()
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
  computedObj?.getProperties().map(item => {

    if (Node.isMethodDeclaration(item)) {
      let text = item.getText()
      let docs: Docs
      docs = getDocs(item)
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
    isArray: boolean
    defaultValue?: string
  }

  let propsMembers: PropsMember[] = []
  propsObj?.getProperties().map(item => {

    if (Node.isPropertyAssignment(item)) {
      let value = item.getNodeProperty('initializer')
      let type: string = ''
      let text: string = ''
      let required = false
      let isArray = false
      let defaultValue = ''
      let name = item.getNodeProperty('name').getText()
      if (Node.isObjectLiteralExpression(value)) {
        text = value.getText()
        let _type = value.getProperty('type')
        if (Node.isPropertyAssignment(_type)) {
          type = _type.getNodeProperty("initializer").getText() || ''
        }
        required = value.getProperty('required')?.getText() === 'true' || false
        let _default = value.getProperty('default')
        if (Node.isPropertyAssignment(_default)) {
          defaultValue = _default.getNodeProperty('initializer').getText() || ''
        }


      } else {
        isArray = true
        type = item.getNodeProperty('initializer').getText()
        text = `{type:${type}}`
      }

      let docs = getDocs(item)
      propsMembers.push({ docs, text, name, type, isArray, required, defaultValue })
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
      let name = `watch${target.substr(0, 1).toLocaleUpperCase() + target.substr(1)}Changes`
      let docs = getDocs(item)
      item.rename(name)
      let text = item.getText()
      let options: (string | undefined)[] = []

      watchMembers.push({ text, target, docs, options })

    } else if (Node.isPropertyAssignment(item)) {
      let obj = item.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression)
      let handler = obj?.getProperty('handler')
      if (obj && Node.isMethodDeclaration(handler)) {
        let target = handler.getName()
        let match = target.match(/^['"`]([^]*)['"`]$/)
        if (match) target = match[1]
        let name = `watch${target.substr(0, 1).toLocaleUpperCase() + target.substr(1)}Changes`
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
        ignoredWatchMembers.push(item)
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
      if (fs.existsSync(originalPath + '.vue')) {
        item.replaceWithText(`'${item.getLiteralText()}.vue'`)
      }
      // Suffixes for TS files do not seem to be needed
      if (fs.existsSync(originalPath + '.js')) {
        item.replaceWithText(`'${item.getLiteralText()}.ts'`)
      }
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
  baseName = baseName.substr(0, 1).toLocaleUpperCase() + baseName.substr(1)
  baseName = baseName.replace(/[-_]([A-z])/g, (val, $1: string) => {
    return $1.toLocaleUpperCase()
  })

  sf.addImportDeclaration({ moduleSpecifier: 'vue-property-decorator', namedImports: NeedToImports })
  let defaultClass = sf.addClass({
    name: baseName, isDefaultExport: true, extends: mixinMembers.length ? 'Mixins(' + mixinMembers.join(',') + ')' : 'Vue',
    decorators: [{ name: 'Component', arguments: [others.length ? '{\n' + others.join(',\n') + '\n}' : ''] }]
  })
  let inConstructorDatas: DataMember[] = []
  defaultClass.addMember((writer) => {
    propsMembers.map(item => {
      writer.newLine()
      // The type is not easy to deal with
      // :${item.type.toLocaleLowerCase()}
      writer.write(`@Prop(${item.text})${item.text ? '\n' : ''} ${item.name}${item.isArray ? '' : ' = ' + item.defaultValue} ;`)
    })
    propsArrayMembers?.map(item => {
      writer.newLine()
      writer.write(`@Prop() ${item.match(/^['"`]([^]*)['"`]$/)?.[1]} ;`)
    })
    writer.blankLineIfLastNot()
    dataMembers.map(item => {
      writer.newLine()
      item.docs.before.length && writer.write(item.docs.before.join('\n') + '\n')
      if (!item.inConstructor) {
        writer.write(`${item.name}:${item.type} = ${item.initializer}; ${item.docs.after.join(' ')}`)
      } else {
        inConstructorDatas.push(item)
        writer.write(`${item.name}:${item.type}; ${item.docs.after.join(' ')}`)
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
      writer.write(item.docs.before.join('\n'))
      writer.newLine()
      writer.write('get ' + item.text + ';')
    })


    lifeCycleMembers.map(item => {
      writer.blankLineIfLastNot()
      writer.write(item.docs.before.join('\n'))
      writer.newLine()
      writer.write(item.text + ';')
    })

    methodsMembers.map((item) => {

      writer.blankLineIfLastNot()
      writer.write(item.docs.before.join('\n'))
      writer.newLine()
      writer.write(item.text + ';')
    })

    watchMembers.map(item => {
      let options = item.options.length ? `, { ${item.options.join(', ')} }` : ''
      writer.blankLineIfLastNot()
      writer.write(item.docs.before.join('\n'))
      writer.newLine()
      writer.write(`@Watch('${item.target}'${options})`)
      writer.newLine()
      writer.write(item.text + ';')
    })
  })

  return true
}
