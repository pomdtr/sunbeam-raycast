import { Action, ActionPanel, Form } from "@raycast/api";
import { useState } from "react";
import * as sunbeam from "sunbeam-types";

export default function AddSunbeamCommand() {
  const [title, setTitle] = useState("");
  const [command, setCommand] = useState("");

  const action: { action: sunbeam.Action } = {
    action: {
      type: "push-page",
      page: {
        type: "dynamic",
        command,
      },
    },
  };

  return (
    <Form
      actions={
        <ActionPanel>
          {title && command ? (
            <Action.CreateQuicklink
              quicklink={{
                name: title,
                link: `raycast://extensions/pomdtr/sunbeam/view?context=${encodeURIComponent(JSON.stringify(action))}`,
              }}
            />
          ) : null}
        </ActionPanel>
      }
    >
      <Form.TextField id="title" title="Title" placeholder="Sunbeam" value={title} onChange={setTitle} />
      <Form.TextField id="command" title="Command" placeholder="sunbeam" value={command} onChange={setCommand} />
    </Form>
  );
}
