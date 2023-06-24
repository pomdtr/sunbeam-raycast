import { ActionPanel, Action, Form, useNavigation, Icon } from "@raycast/api";
import { SunbeamPage } from "./sunbeam";
import { useState } from "react";

function deeplink(command: string) {
  const context = encodeURIComponent(JSON.stringify({ command }));
  return `raycast://extensions/pomdtr/sunbeam/run-command?launchContext=${context}`;
}

export default function (props: { arguments: Arguments.EvalExpression; launchContext: { expression?: string } }) {
  const navigation = useNavigation();
  const [expression, setExpression] = useState<string>("");

  if (props.launchContext?.expression) {
    return (
      <SunbeamPage
        action={{
          type: "eval",
          expression: props.arguments.expression,
        }}
      />
    );
  }

  if (props.arguments?.expression) {
    return (
      <SunbeamPage
        action={{
          type: "eval",
          expression: props.arguments.expression,
        }}
      />
    );
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.Play}
            title="Eval Expression"
            onSubmit={({ expression }) => {
              navigation.push(<SunbeamPage action={{ type: "eval", expression }} />);
            }}
          />
          <Action.CreateQuicklink
            title="Create Quicklink"
            quicklink={{
              link: deeplink(expression),
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea id="expression" title="Expression" value={expression} onChange={setExpression} />
    </Form>
  );
}
