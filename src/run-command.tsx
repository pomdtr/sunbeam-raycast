import { Action, ActionPanel, Icon, LaunchProps, List } from "@raycast/api";
import { Sunbeam } from "./sunbeam";
import { useCommandHistory } from "./history";
import { useState } from "react";

function deeplink(command: string) {
  const args = encodeURIComponent(JSON.stringify({ command }));
  return `raycast://extensions/pomdtr/sunbeam/run-command?arguments=${args}`;
}

export default function RunCommand(
  props: LaunchProps<{ arguments: Arguments.RunCommand; launchContext: { command?: string } }>
) {
  const history = useCommandHistory();
  const [query, setQuery] = useState("");

  if (props.arguments.command) {
    return <Sunbeam command={`sunbeam ${props.arguments.command}`} />;
  }

  if (props.launchContext?.command) {
    return <Sunbeam command={props.launchContext.command} />;
  }

  return (
    <List isLoading={history.isLoading} onSearchTextChange={setQuery} filtering>
      <List.EmptyView
        icon={Icon.Terminal}
        description={query ? `Press enter to run your command` : "Please enter a command to run"}
        actions={
          <ActionPanel>
            {query && <Action.Push icon={Icon.Terminal} title="Run Command" target={<Sunbeam command={query} />} />}
          </ActionPanel>
        }
      />
      {history.commands &&
        Object.entries(history.commands)
          ?.sort((a, b) => b[1].lastUsed - a[1].lastUsed)
          .map(([command, data]) => (
            <List.Item
              key={command}
              title={command}
              accessories={[
                {
                  date: new Date(data.lastUsed),
                  tooltip: new Date(data.lastUsed).toLocaleString(),
                },
              ]}
              actions={
                <ActionPanel>
                  <Action.Push icon={Icon.Terminal} title="Run Command" target={<Sunbeam command={command} />} />
                  <Action.Push icon={Icon.Terminal} title="Run Query" target={<Sunbeam command={query} />} />
                  <Action.CopyToClipboard
                    title="Copy Command"
                    content={command}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  />
                  <Action.CreateQuicklink
                    quicklink={{ link: deeplink(command) }}
                    shortcut={{ modifiers: ["cmd"], key: "s" }}
                  />
                  <Action
                    icon={Icon.Trash}
                    title="Remove Command"
                    shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
                    onAction={async () => {
                      history.removeCommand(command);
                    }}
                  />
                </ActionPanel>
              }
            />
          ))}
    </List>
  );
}
