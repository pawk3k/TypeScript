import {
    ApplicableRefactorInfo,
    Diagnostics,
    emptyArray,
    findAncestor,
    getLocaleSpecificMessage,
    isFunctionLike,
    isJsxClosingElement,
    isJsxOpeningElement,
    isJsxSelfClosingElement,
    isSourceFileJS,
    RefactorContext,
    type FileTextChanges,
    type RefactorEditInfo,
    type TypeChecker,
} from "../_namespaces/ts.js";
import {
    type SourceFile,
    type Node,
    forEachChild,
    isBlock,
} from "../_namespaces/ts.js";
import { registerRefactor } from "../_namespaces/ts.refactor.js";
const refactorName = "Add React useRef to Component";
const refactorDescription = getLocaleSpecificMessage(
    Diagnostics.Add_React_useRef_to_Component
);

const useRefAction = {
    name: refactorName,
    description: refactorDescription,
    kind: "refactor.react.addUseRef",
};

registerRefactor(refactorName, {
    kinds: [useRefAction.kind],
    getAvailableActions: getRefactorActionsToAddUseRef,
    getEditsForAction: getRefactorEditsToAddUseRef as any,
});

function getRefactorEditsToAddUseRef(
    context: RefactorContext
): RefactorEditInfo | undefined {
    const { file, startPosition } = context;
    const sourceFile = context.program.getSourceFile(file.fileName);
    if (!sourceFile) return;

    const node = getNodeAtPosition(sourceFile, startPosition);
    if (!node) return;

    if (
        !isJsxOpeningElement(node) &&
        !isJsxClosingElement(node) &&
        !isJsxSelfClosingElement(node)
    ) {
        return; // Check if the node is a JSX element
    }

    const functionNode = findAncestor(node, isFunctionLike);
    if (!functionNode) return;

    const edits: FileTextChanges[] = [];

    // Add useRef hook at the beginning of the function body
    const useRefHook = `const ref = React.useRef<${getJsxElementType(
        node,
        context.program.getTypeChecker()
    )}>(null);`;

    // eslint-disable-next-line local/no-in-operator
    if (!functionNode || !("body" in functionNode)) return;

    const functionBody = functionNode.body;
    if (functionBody && isBlock(functionBody)) {
        const functionBodyStart = functionBody.getStart() + 1; // +1 to insert inside the block

        edits.push({
            fileName: file.fileName,
            textChanges: [
                {
                    span: { start: functionBodyStart, length: 0 },
                    newText: `\n${useRefHook}\n`,
                },
            ],
        });
    }

    // Add ref attribute to the JSX element
    const jsxElementStart = node.getStart();
    const jsxElementEnd = node.getEnd();
    const jsxElementText = node.getText();
    const refAttribute = ` ref={ref}`;
    const modifiedJsxElementText = jsxElementText.replace(
        /<(\w+)/,
        `<$1${refAttribute}`
    );

    edits.push({
        fileName: file.fileName,
        textChanges: [
            {
                span: {
                    start: jsxElementStart,
                    length: jsxElementEnd - jsxElementStart,
                },
                newText: modifiedJsxElementText,
            },
        ],
    });

    return { edits };
}

function getJsxElementType(node: Node, checker: TypeChecker): string {
    if (isJsxOpeningElement(node) || isJsxSelfClosingElement(node)) {
        const tagName = node.tagName.getText();
        const symbol = checker.getSymbolAtLocation(node.tagName);
        if (symbol) {
            const type = checker.getTypeOfSymbolAtLocation(symbol, node);
            const typeName = checker.typeToString(type);

            // Extract the underlying HTML element type
            const match = typeName.match(/HTMLAttributes<(\w+)>/);
            if (match) {
                return match[1];
            }

            return typeName;
        }
        return tagName.charAt(0).toUpperCase() + tagName.slice(1);
    }
    return "HTMLElement";
}

function getRefactorActionsToAddUseRef(
    context: RefactorContext
): readonly ApplicableRefactorInfo[] {
    const { file, startPosition } = context;
    if (isSourceFileJS(file)) return emptyArray;

    const node = getNodeAtPosition(file, startPosition);

    if (!node) return emptyArray;

    // TODO: This should also trigger on the JSX identifier
    if (
        !isJsxOpeningElement(node) &&
        !isJsxClosingElement(node) &&
        !isJsxSelfClosingElement(node)
    ) {
        return emptyArray; // Check if the node is a JSX element
    }

    return [
        {
            name: refactorName,
            description: refactorDescription,
            actions: [useRefAction],
        },
    ];
}

function getNodeAtPosition(
    sourceFile: SourceFile,
    position: number
): Node | undefined {
    function find(node: Node): Node | undefined {
        if (position >= node.getStart() && position < node.getEnd()) {
            return forEachChild(node, find) || node;
        }
        return undefined;
    }
    return find(sourceFile);
}

