import { Keyboard } from "@raycast/api";
import {
  Action,
  ActionPanel,
  Detail,
  Form,
  List,
  closeMainWindow,
  showToast,
  LaunchProps,
  Toast,
  Icon,
  useNavigation,
} from "@raycast/api";
import { useExec } from "@raycast/utils";
import { spawnSync } from "child_process";
import os from "os";
import * as sunbeam from "sunbeam-types";

process.env.PATH =
  "/Users/pomdtr/go/bin:/Users/pomdtr/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

export default function Sunbeam(props: LaunchProps<{ arguments: { command?: string } }>) {
  const action: sunbeam.Action | undefined = props.arguments?.command
    ? { type: "push-page", title: "Run", page: { type: "dynamic", command: `sunbeam ${props.arguments.command}` } }
    : undefined;
  return <SunbeamPage action={action} />;
}

export function SunbeamPage(props: { action?: sunbeam.Action }) {
  const { data: page, revalidate } = useExec<sunbeam.Page>("sunbeam", props.action ? ["trigger"] : [], {
    input: props.action ? JSON.stringify(props.action) : "",
    cwd: os.homedir(),
    parseOutput: ({ stdout, stderr, exitCode }) => {
      if (exitCode !== 0) {
        throw new Error(stderr);
      }

      return JSON.parse(stdout);
    },
  });

  if (!page) {
    return <Detail isLoading />;
  }

  switch (page?.type) {
    case "list":
      return <SunbeamList list={page} reload={revalidate} />;
    case "detail":
      return <SunbeamDetail detail={page} />;
    case "form":
      return <SunbeamForm action={page.submitAction} />;
  }
}

function SunbeamList(props: { list: sunbeam.List; reload: () => void }) {
  return (
    <List isShowingDetail={props.list.showPreview}>
      {props.list.items?.map((item) => (
        <SunbeamListItem key={item.id || item.title} item={item} reload={props.reload} />
      ))}
    </List>
  );
}

function SunbeamForm(props: { action: sunbeam.Action }) {
  return (
    <Form actions={<ActionPanel></ActionPanel>}>
      {props.action.inputs?.map((input) => {
        switch (input.type) {
          case "textfield":
            return (
              <Form.TextField key={input.name} id={input.name} title={input.title} placeholder={input.placeholder} />
            );
          case "textarea":
            return (
              <Form.TextArea key={input.name} id={input.name} title={input.title} placeholder={input.placeholder} />
            );
          case "checkbox":
            return (
              <Form.Checkbox key={input.name} id={input.name} title={input.title} label={input.label || "No Label"} />
            );
          case "dropdown":
            return (
              <Form.Dropdown key={input.name} id={input.name} title={input.title}>
                {input.items.map((item, idx) => (
                  <Form.Dropdown.Item key={idx} value={item.value} title={item.title} />
                ))}
              </Form.Dropdown>
            );
        }
      })}
    </Form>
  );
}

function SunbeamDetail(props: { detail: sunbeam.Detail }) {
  let markdown = "";
  if (props.detail.preview?.type === "static") {
    markdown = props.detail.preview.text;
  }

  return <Detail markdown={markdown} />;
}

function SunbeamListItem(props: { item: sunbeam.Listitem; reload: () => void }) {
  return (
    <List.Item
      title={props.item.title}
      subtitle={props.item.subtitle}
      actions={
        <ActionPanel>
          {props.item.actions?.map((action, idx) => (
            <SunbeamAction key={idx} action={action} reload={props.reload} />
          ))}
        </ActionPanel>
      }
      accessories={props.item.accessories?.map((accessory) => ({ tag: accessory }))}
    />
  );
}

function SunbeamAction({ action, reload }: { action: sunbeam.Action; reload: () => void }): JSX.Element {
  const navigation = useNavigation();
  const shortcut = action.key ? ({ modifiers: ["cmd"], key: action.key } as Keyboard.Shortcut) : undefined;
  switch (action.type) {
    case "copy-text":
      return <Action.CopyToClipboard title={action.title} shortcut={shortcut} content={action.text} />;
    case "open-url":
      return <Action.OpenInBrowser title={action.title} shortcut={shortcut} url={action.url} />;
    case "open-path":
      return <Action.Open title={action.title || ""} shortcut={shortcut} target={action.path} />;
    case "push-page":
      return <Action.Push title={action.title || ""} target={<SunbeamPage action={action} />} shortcut={shortcut} />;
    case "run-command": {
      const runAction = async () => {
        const toast = await showToast({ title: "Running", style: Toast.Style.Animated });
        spawnSync("sunbeam", ["trigger"], { encoding: "utf-8", input: JSON.stringify(action) });
        if (action.onSuccess == "reload") {
          reload();
        } else {
          closeMainWindow();
        }
        toast.hide();
      };

      return (
        <Action
          icon={Icon.Terminal}
          title={action.title || "Run"}
          shortcut={shortcut}
          onAction={async () => {
            if (action.inputs) {
              navigation.push(<SunbeamForm action={action} />);
            } else {
              await runAction();
            }
          }}
        />
      );
    }
  }
}
