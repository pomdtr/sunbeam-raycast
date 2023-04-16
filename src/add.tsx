import { Action, ActionPanel, Form, LaunchProps } from "@raycast/api";
import { useState } from "react";
import * as sunbeam from "sunbeam-types";
import { SunbeamPage } from "./page";

export default function Sunbeam(props: LaunchProps<{ launchContext: { action?: sunbeam.Action } }>) {
  if (!props.launchContext?.action) {
    return <AddSunbeamCommand />;
  }
  return <SunbeamPage action={props.launchContext?.action} />;
}

export function AddSunbeamCommand() {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");

  const action: { action: sunbeam.Action } = {
    action: {
      type: "run",
      onSuccess: "push",
      command,
    },
  };

  return (
    <Form
      actions={
        <ActionPanel>
          {name && command ? (
            <Action.CreateQuicklink
              quicklink={{
                name,
                link: `raycast://extensions/pomdtr/sunbeam/add?context=${encodeURIComponent(JSON.stringify(action))}`,
              }}
            />
          ) : null}
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Title" placeholder="Command title" value={name} onChange={setName} />
      <Form.TextField
        id="command"
        title="Command"
        placeholder="sunbeam run <command>"
        value={command}
        onChange={setCommand}
      />
    </Form>
  );
}
