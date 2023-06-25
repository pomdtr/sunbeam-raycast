import { ActionPanel, Action, Form, useNavigation, Icon } from "@raycast/api";
import { SunbeamPage } from "./sunbeam";
import { useState } from "react";

function deeplink(url: string) {
  const context = encodeURIComponent(JSON.stringify({ url }));
  return `raycast://extensions/pomdtr/sunbeam/fetch-page?launchContext=${context}`;
}

export default function (props: { arguments: Arguments.FetchPage; launchContext: { url?: string } }) {
  const navigation = useNavigation();
  const [url, setUrl] = useState<string>("");

  if (props.launchContext?.url) {
    return (
      <SunbeamPage
        action={{
          type: "fetch",
          request: props.launchContext.url,
        }}
      />
    );
  }

  if (props.arguments?.url) {
    return (
      <SunbeamPage
        action={{
          type: "fetch",
          request: props.arguments.url,
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
            title="Fetch Page"
            onSubmit={({ url }) => {
              navigation.push(<SunbeamPage action={{ type: "fetch", request: url }} />);
            }}
          />
          <Action.CreateQuicklink
            title="Create Quicklink"
            quicklink={{
              link: deeplink(url),
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="url" title="URL" value={url} onChange={setUrl} />
    </Form>
  );
}
