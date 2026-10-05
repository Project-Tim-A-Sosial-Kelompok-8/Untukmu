import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import generateModule from "@babel/generator";
import * as t from "@babel/types";
const traverse = traverseModule.default || traverseModule;
const generate = generateModule.default || generateModule;
export function portReactUI(source) {
  const ast = parse(source);
  traverse(ast, { AssignmentExpression(path) {
    const { left, right, operator } = path.node;
    if (operator === "=" && t.isMemberExpression(left) && !left.computed && t.isIdentifier(left.property, { name: "innerHTML" })) {
      path.replaceWith(t.callExpression(t.memberExpression(t.identifier("UM"), t.identifier("renderScreen")), [left.object, right])); path.skip();
    }
  } });
  return generate(ast, { comments: true }).code;
}
