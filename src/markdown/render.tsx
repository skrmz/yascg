import type { ReactNode } from "react";
import type { BlockNode, InlineNode } from "./parse.ts";

function renderInline(nodes: readonly InlineNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case "text":
        return node.value;
      case "strong":
        return <strong key={key}>{node.value}</strong>;
      case "em":
        return <em key={key}>{node.value}</em>;
      case "code":
        return <code key={key}>{node.value}</code>;
      default:
        return null;
    }
  });
}

export function Inline({ nodes }: { nodes: readonly InlineNode[] }) {
  return <>{renderInline(nodes, "i")}</>;
}

export function Block({ block, keyPrefix }: { block: BlockNode; keyPrefix: string }) {
  switch (block.type) {
    case "heading": {
      const content = renderInline(block.children, `${keyPrefix}-h`);
      if (block.depth <= 2) return <h3 className="card-h">{content}</h3>;
      return <h4 className="card-h card-h-sub">{content}</h4>;
    }
    case "paragraph":
      return <p className="card-p">{renderInline(block.children, `${keyPrefix}-p`)}</p>;
    case "list":
      return block.ordered ? (
        <ol className="card-ol">
          {block.items.map((item, index) => (
            <li key={`${keyPrefix}-li-${index}`}>
              {renderInline(item, `${keyPrefix}-li-${index}`)}
            </li>
          ))}
        </ol>
      ) : (
        <ul className="card-ul">
          {block.items.map((item, index) => (
            <li key={`${keyPrefix}-li-${index}`}>
              {renderInline(item, `${keyPrefix}-li-${index}`)}
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <table className="card-table">
          <thead>
            <tr>
              {block.header.map((cell, index) => (
                <th key={`${keyPrefix}-th-${index}`}>
                  {renderInline(cell, `${keyPrefix}-th-${index}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`${keyPrefix}-tr-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${keyPrefix}-td-${rowIndex}-${cellIndex}`}>
                    {renderInline(cell, `${keyPrefix}-td-${rowIndex}-${cellIndex}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "code":
      return <pre className="card-pre">{block.value}</pre>;
    case "hr":
      return <hr className="card-hr" />;
    default:
      return null;
  }
}

export function BlockList({ blocks }: { blocks: readonly BlockNode[] }) {
  return (
    <>
      {blocks.map((block, index) => (
        <Block key={`b-${index}`} block={block} keyPrefix={`b-${index}`} />
      ))}
    </>
  );
}
