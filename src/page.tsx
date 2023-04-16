import { Keyboard } from "@raycast/api";
import {
  Action,
  ActionPanel,
  Detail,
  Form,
  List,
  closeMainWindow,
  showToast,
  Toast,
  Icon,
  useNavigation,
} from "@raycast/api";
import { useExec } from "@raycast/utils";
import { spawnSync } from "child_process";
import os from "os";
import * as sunbeam from "sunbeam-types";

function initEnv() {
  const shell = process.env.SHELL || "/bin/zsh";
  const env = spawnSync(shell, ["-li", "-c", "env"], { encoding: "utf-8" }).stdout;
  for (const line of env.split("\n")) {
    const [key, value] = line.split("=");
    process.env[key] = value;
  }
}

initEnv();

export function SunbeamPage(props: { action: sunbeam.Action }) {
  console.debug("action", JSON.stringify(props.action, null, 2));
  const { data: page, revalidate } = useExec<sunbeam.Page>("sunbeam", ["trigger"], {
    input: JSON.stringify(props.action),
    execute: !props.action?.inputs,
    cwd: os.homedir(),
    parseOutput: (res) => {
      if (res.exitCode !== 0) {
        showToast(Toast.Style.Failure, "Error", res.stderr);
        return undefined;
      }

      return JSON.parse(res.stdout);
    },
  });

  if (props.action?.inputs && props.action.inputs.length > 0) {
    return <SunbeamForm action={props.action} />;
  }

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
    <Form>
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

function codeblock(text: string, language?: string) {
  return `\`\`\`${language || ""}
${text}
\`\`\``;
}

function SunbeamDetail(props: { detail: sunbeam.Detail }) {
  let markdown = "";
  if (props.detail.preview?.type === "static") {
    markdown = codeblock(props.detail.preview.text, props.detail.preview.language);
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
    case "copy":
      return <Action.CopyToClipboard title={action.title} shortcut={shortcut} content={action.text} />;
    case "open":
      return <Action.OpenInBrowser title={action.title} url={action.target} />;
    case "reload":
      return <Action title={action.title || "Reload"} shortcut={shortcut} onAction={reload} />;
    case "exit":
      return <Action title={action.title || "Exit"} shortcut={shortcut} onAction={closeMainWindow} />;
    case "push":
      return (
        <Action.Push
          icon={Icon.ArrowRight}
          title={action.title || ""}
          target={<SunbeamPage action={action} />}
          shortcut={shortcut}
        />
      );
    case "run": {
      if (action.onSuccess == "push") {
        return (
          <Action.Push
            icon={Icon.Terminal}
            title={action.title || "Run"}
            shortcut={shortcut}
            target={<SunbeamPage action={action} />}
          />
        );
      }

      const runAction = async () => {
        spawnSync("sunbeam", ["trigger"], { encoding: "utf-8", input: JSON.stringify(action) });
      };
      if (action.inputs && action.inputs.length > 0) {
        return (
          <Action.Push
            icon={Icon.Terminal}
            title={action.title || "Run"}
            shortcut={shortcut}
            target={<SunbeamForm action={action} />}
          />
        );
      }

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
