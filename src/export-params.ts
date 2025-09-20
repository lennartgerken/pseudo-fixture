import * as acorn from 'acorn'

export const exportParams = (fn: Function) => {
    const props: string[] = []
    const setProps = (
        pattern: acorn.ArrowFunctionExpression | acorn.FunctionDeclaration
    ) => {
        if (pattern.params.length > 0) {
            const param = pattern.params[0]
            if (param.type === 'ObjectPattern') {
                param.properties.forEach((prop) => {
                    if (prop.type === 'Property') {
                        if (prop.key.type === 'Identifier')
                            props.push(prop.key.name)
                    }
                })
            }
        }
    }

    const fnParse = acorn.parse(fn.toString(), {
        ecmaVersion: 'latest'
    })

    if (fnParse.body.length > 0) {
        const statement = fnParse.body[0]

        if (statement.type === 'ExpressionStatement') {
            const expression = statement.expression
            if (expression.type === 'ArrowFunctionExpression') {
                setProps(expression)
            }
        } else if (statement.type === 'FunctionDeclaration') {
            setProps(statement)
        }
    }

    return props
}
