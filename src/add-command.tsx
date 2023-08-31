import { ActionPanel, Action, Form } from "@raycast/api";
import { useState } from "react";

const argumentRegexp = /\{([^}]+)\}/g;

function deeplink(command: string): string {
  const matches = command.matchAll(argumentRegexp);
  let args = encodeURIComponent(JSON.stringify({ command }));

  // Replace encoded curly braces with unencoded curly braces
  // These will be encoded again by the quicklink
  for (const match of matches) {
    const [, name] = match;
    args = args.replace("%7B" + name + "%7D", "{" + name + "}");
  }

  return `raycast://extensions/pomdtr/sunbeam/run-command?arguments=${args}`;
}

export default function AddCommand() {
  const [command, setCommand] = useState<string>("");

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.CreateQuicklink
            title="Create Quicklink"
            quicklink={{
              link: deeplink(command),
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="command" title="Command" value={command} onChange={setCommand} />
    </Form>
  );
}
