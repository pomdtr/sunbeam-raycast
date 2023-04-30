import {
  Keyboard,
  Action,
  ActionPanel,
  Detail,
  Form,
  List,
  closeMainWindow,
  showToast,
  Toast,
  Icon,
  LocalStorage,
  useNavigation,
} from "@raycast/api";
import { execa, execaSync } from "execa";
import { useEffect, useState } from "react";
import * as sunbeam from "sunbeam-types";
import which from "which";
import shlex from "shlex";
import { useCommandHistory } from "./history";

function initEnv() {
  const shell = process.env.SHELL || "/bin/zsh";
  const { stdout: env } = execaSync(shell, ["-li", "-c", "env"], { encoding: "utf-8" });
  for (const line of env.split("\n")) {
    const [key, value] = line.split("=");
    process.env[key] = value;
  }
}

function codeblock(text: string, language?: string) {
  return `\`\`\`${language || ""}
${text}
\`\`\``;
}

async function refreshPreview(preview: sunbeam.Preview): Promise<string> {
  if (typeof preview === "string") {
    return preview;
  }

  if (preview.text) {
    return preview.highlight == "markdown" ? preview.text : codeblock(preview.text, preview.highlight);
  }

  if (preview.command) {
    if (typeof preview.command === "string") {
      const args = shlex.split(preview.command);
      return execa(args[0], args.slice(1)).then((result) => result.stdout);
    } else if (Array.isArray(preview.command)) {
      return execa(preview.command[0], preview.command.slice(1)).then((result) => result.stdout);
    } else {
      const args = preview.command.args || [];
      return execa(args[0], args.slice(1)).then((result) => result.stdout);
    }
  }

  return "no preview";
}

export function Sunbeam(props: { command: string }) {
  initEnv();

  const history = useCommandHistory();

  useEffect(() => {
    if (history.isLoading) {
      return;
    }
    history.saveCommand(props.command);
  }, [history.isLoading]);

  if (which.sync("sunbeam", { nothrow: true }) == null) {
    return <SunbeamNotInstalled />;
  }
  return <SunbeamPage action={{ type: "run", onSuccess: "push", command: props.command }} />;
}

export function CommandForm(props: { onSubmit: (command: string) => void; isLoading?: boolean }) {
  return (
    <Form
      isLoading={props.isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            onSubmit={(values: { command: string }) => {
              props.onSubmit(values.command);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="command" title="Command" placeholder="sunbeam extension browse" />
    </Form>
  );
}

function SunbeamNotInstalled() {
  return (
    <Detail
      markdown={codeblock("Sunbeam is not installed")}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open Sunbeam Homepage" url="https://pomdtr.github.io/sunbeam" />
          <Action.OpenInBrowser title="Open Sunbeam Repository" url="https://github.com/pomdtr/sunbeam" />
        </ActionPanel>
      }
    />
  );
}

async function runAction(action: sunbeam.Action): Promise<sunbeam.Page> {
  const { exitCode, stdout, stderr } = await execa("sunbeam", {
    encoding: "utf-8",
    input: JSON.stringify(action),
  });
  if (exitCode != 0) {
    throw new Error(stderr);
  }
  return JSON.parse(stdout) as sunbeam.Page;
}

function SunbeamPage(props: { action: sunbeam.Action }) {
  const [page, setPage] = useState<sunbeam.Page>();

  const generator = async () => {
    try {
      const action = await runAction(props.action);
      setPage(action);
    } catch (err) {
      showToast(Toast.Style.Failure, "Error", (err as Error).message);
    }
  };

  useEffect(() => {
    generator();
  }, []);

  if (props.action?.inputs && props.action.inputs.length > 0) {
    return <SunbeamForm action={props.action} />;
  }

  if (!page) {
    return <Detail isLoading />;
  }

  switch (page?.type) {
    case "list":
      return <SunbeamList list={page} reload={generator} />;
    case "detail":
      return <SunbeamDetail detail={page} />;
    case "form":
      return <SunbeamForm action={page.submitAction} />;
  }
}

function SunbeamList(props: { list: sunbeam.List; reload: () => void }) {
  const [selected, setSelected] = useState<string | null>("-1");
  return (
    <List isShowingDetail={props.list.showPreview} onSelectionChange={setSelected}>
      {props.list.items?.map((item, idx) => (
        <SunbeamListItem
          key={item.id || idx}
          id={item.id || idx.toString()}
          item={item}
          selected={item.id == selected}
          reload={props.reload}
        />
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

function SunbeamDetail(props: { detail: sunbeam.Detail }) {
  const [markdown, setMarkdown] = useState<string>();

  useEffect(() => {
    refreshPreview(props.detail.preview).then(setMarkdown);
  }, []);

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          {props.detail.actions?.map((action, idx) => (
            <SunbeamAction
              key={idx}
              action={action}
              reload={() => {
                refreshPreview(props.detail.preview).then(setMarkdown);
              }}
            />
          ))}
        </ActionPanel>
      }
    />
  );
}

function SunbeamListItem(props: { id: string; item: sunbeam.Listitem; selected: boolean; reload: () => void }) {
  const [detail, setDetail] = useState<string>();

  useEffect(() => {
    if (!props.selected) {
      return;
    }
    if (!props.item.preview) {
      return;
    }
    refreshPreview(props.item.preview).then(setDetail);
  }, [props.selected]);

  return (
    <List.Item
      id={props.item.id}
      title={props.item.title}
      subtitle={props.item.subtitle}
      detail={<List.Item.Detail markdown={detail} />}
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
      return (
        <Action
          title={action.title || "Copy"}
          shortcut={shortcut}
          onAction={async () =>
            await execa("sunbeam", {
              input: JSON.stringify(action),
            })
          }
        />
      );
    case "open":
      return (
        <Action
          title={action.title || "Open"}
          shortcut={shortcut}
          onAction={async () =>
            await execa("sunbeam", {
              input: JSON.stringify(action),
            })
          }
        />
      );
    case "reload":
      return <Action title={action.title || "Reload"} shortcut={shortcut} onAction={reload} />;
    case "exit":
      return <Action title={action.title || "Exit"} shortcut={shortcut} onAction={closeMainWindow} />;
    case "push":
      return <Action.Push title={action.title || ""} target={<SunbeamPage action={action} />} shortcut={shortcut} />;
    case "run": {
      if (action.onSuccess == "push") {
        return (
          <Action.Push title={action.title || "Run"} shortcut={shortcut} target={<SunbeamPage action={action} />} />
        );
      }

      if (action.inputs && action.inputs.length > 0) {
        return (
          <Action.Push title={action.title || "Run"} shortcut={shortcut} target={<SunbeamForm action={action} />} />
        );
      }

      return (
        <Action
          title={action.title || "Run"}
          shortcut={shortcut}
          onAction={async () => {
            if (action.inputs) {
              navigation.push(<SunbeamForm action={action} />);
            } else {
              const res = await execa("sunbeam", { encoding: "utf-8", input: JSON.stringify(action) });
              if (res.exitCode != 0) {
                showToast(Toast.Style.Failure, "Error", res.stderr);
                return;
              }
              if (action.onSuccess == "reload") {
                reload();
              } else {
                closeMainWindow();
              }
            }
          }}
        />
      );
    }
  }
}
