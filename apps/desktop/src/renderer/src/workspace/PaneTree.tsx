import { Fragment } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { PaneNode, Tab } from '../../../shared/workspace'
import { TerminalView } from '../terminal/TerminalView'
import { useWorkspace } from './workspace-store'

export function PaneTree({ tab }: { tab: Tab }) {
  return <PaneNodeView node={tab.root} tab={tab} single={tab.root.kind === 'terminal'} />
}

function PaneNodeView({ node, tab, single }: { node: PaneNode; tab: Tab; single: boolean }) {
  const focusPane = useWorkspace((state) => state.focusPane)
  const setSplitSizes = useWorkspace((state) => state.setSplitSizes)

  if (node.kind === 'terminal') {
    const focused = tab.focusedPaneId === node.id
    return (
      <div
        className={`h-full w-full border transition-colors ${
          !single && focused ? 'border-electric-600/60' : 'border-transparent'
        }`}
        onFocusCapture={() => focusPane(node.id)}
      >
        <TerminalView pane={node} focused={focused} />
      </div>
    )
  }

  const layout = Object.fromEntries(node.children.map((child, index) => [child.id, node.sizes[index] ?? 50]))
  return (
    <Group
      // A new set of children needs a new default layout.
      key={node.children.map((child) => child.id).join(':')}
      orientation={node.direction}
      defaultLayout={layout}
      onLayoutChanged={(next) =>
        setSplitSizes(
          tab.id,
          node.id,
          node.children.map((child, index) => next[child.id] ?? node.sizes[index] ?? 50),
        )
      }
    >
      {node.children.map((child, index) => (
        <Fragment key={child.id}>
          {index > 0 && (
            <Separator
              className={`bg-navy-800 transition-colors hover:bg-electric-600 data-[separator=active]:bg-electric-600 ${
                node.direction === 'horizontal' ? 'w-px' : 'h-px'
              }`}
            />
          )}
          <Panel id={child.id} minSize="10">
            <PaneNodeView node={child} tab={tab} single={single} />
          </Panel>
        </Fragment>
      ))}
    </Group>
  )
}
