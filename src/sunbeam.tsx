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
  useNavigation,
  Clipboard,
  open,
  getPreferenceValues,
} from "@raycast/api";
import { execa, execaSync } from "execa";
import { useEffect, useState } from "react";
import * as sunbeam from "sunbeam-types";
import which from "which";
import shlex from "shlex";
import { useCommandHistory } from "./history";

function initEnv() {
  const { shell } = getPreferenceValues<{ shell: string }>();
  const { stdout: env } = execaSync(shell, ["-li", "-c", "env"], { encoding: "utf-8" });
  for (const line of env.split("\n")) {
    const [key, value] = line.split("=");
    process.env[key] = value;
  }
}

async function runAction(action: sunbeam.Action, inputs?: Record<string, string>, query?: string): Promise<string> {
  const args: string[] = ["trigger"];
  for (const [key, val] of Object.entries(inputs || {})) {
    args.push(`--input=${key}=${val}`);
  }

  if (query) {
    args.push(`--query=${query}`);
  }

  const input = JSON.stringify(action);
  console.debug(`sunbeam ${args.join(" ")} << ${input}`);
  const { exitCode, stdout, stderr } = await execa("sunbeam", args, {
    encoding: "utf-8",
    input,
  });
  if (exitCode != 0) {
    throw new Error(stderr);
  }
  return stdout;
}

function codeblock(text: string, language?: string) {
  return `\`\`\`${language || ""}
${text}
\`\`\``;
}

async function refreshPreview(preview: sunbeam.TextOrCommand): Promise<string> {
  if (typeof preview === "string") {
    return preview;
  }

  if (typeof preview === "string") {
    return preview;
  }

  if ("text" in preview) {
    return preview.text;
  }

  if (preview.command) {
    if (typeof preview.command === "string") {
      const args = shlex.split(preview.command);
      return execa(args[0], args.slice(1)).then((result) => result.stdout);
    } else if (Array.isArray(preview.command)) {
      return execa(preview.command[0], preview.command.slice(1)).then((result) => result.stdout);
    } else {
      return execa(preview.command.name, preview.command.args).then((result) => result.stdout);
    }
  }

  return "";
}

export function Sunbeam(props: { command: string }) {
  const history = useCommandHistory();

  useEffect(() => {
    if (history.isLoading) {
      return;
    }
    history.saveCommand(props.command);
  }, [history.isLoading]);

  initEnv();
  if (which.sync("sunbeam", { nothrow: true }) == null) {
    return <SunbeamNotInstalled />;
  }
  return (
    <SunbeamPage
      action={{
        type: "push",
        page: {
          command: props.command,
        },
      }}
    />
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

function SunbeamPage(props: { action: sunbeam.Action }) {
  const [action, setAction] = useState<sunbeam.Action>(props.action);
  const [page, setPage] = useState<sunbeam.Page>();
  const [inputs, setInputs] = useState<Record<string, string>>();
  const [query, setQuery] = useState<string>();

  useEffect(() => {
    if (action.inputs && !inputs) {
      return;
    }

    runAction(action, inputs)
      .then((result) => JSON.parse(result))
      .then(setPage)
      .catch((err) => {
        showToast(Toast.Style.Failure, "Error", (err as Error).message);
      });
  }, [inputs, action]);

  useEffect(() => {
    if (page?.type !== "list" || typeof page.onQueryChange === "undefined") {
      return;
    }

    if (!query) {
      return;
    }

    setAction({ type: "push", page: { command: page.onQueryChange } });
  }, [query]);

  if (action.inputs && !inputs) {
    return <SunbeamForm inputs={action.inputs} onSubmit={(values) => setInputs(values)} />;
  }

  if (!page) {
    return <Detail isLoading />;
  }

  switch (page?.type) {
    case "list":
      return (
        <SunbeamList
          list={page}
          reload={() => {
            runAction(action, inputs)
              .then((result) => JSON.parse(result))
              .then(setPage)
              .catch((err) => {
                showToast(Toast.Style.Failure, "Error", (err as Error).message);
              });
          }}
          onSearchTextChange={page.onQueryChange ? setQuery : undefined}
        />
      );

    case "detail":
      return <SunbeamDetail detail={page} />;
  }
}

function SunbeamList(props: { list: sunbeam.List; reload: () => void; onSearchTextChange?: (query: string) => void }) {
  const [selected, setSelected] = useState<string | null>("-1");
  const [detail, setDetail] = useState<string>();

  useEffect(() => {
    if (selected == null) {
      return;
    }

    const idx = parseInt(selected);
    const item = props.list.items?.[idx];

    if (!item?.preview) {
      return;
    }

    refreshPreview(item.preview).then((result) => setDetail(result));
  }, [selected]);

  return (
    <List
      isShowingDetail={props.list.showPreview}
      onSelectionChange={setSelected}
      onSearchTextChange={props.onSearchTextChange}
    >
      {props.list.items?.map((item, idx) => (
        <SunbeamListItem key={idx} id={idx.toString()} item={item} detail={detail} reload={props.reload} />
      ))}
    </List>
  );
}

function SunbeamForm(props: { inputs: sunbeam.Input[]; onSubmit: (values: Record<string, string>) => void }) {
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Submit" onSubmit={props.onSubmit} />
        </ActionPanel>
      }
    >
      {props.inputs.map((input) => {
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

function SunbeamListItem(props: { id: string; item: sunbeam.Listitem; detail?: string; reload: () => void }) {
  return (
    <List.Item
      id={props.id}
      title={props.item.title}
      subtitle={props.item.subtitle}
      accessories={props.item.accessories?.map((accessory) => ({
        text: accessory,
      }))}
      detail={<List.Item.Detail markdown={props.detail} />}
      actions={
        <ActionPanel>
          {props.item.actions?.map((action, idx) => (
            <SunbeamAction key={idx} action={action} reload={props.reload} />
          ))}
        </ActionPanel>
      }
    />
  );
}

function SunbeamAction({ action, reload }: { action: sunbeam.Action; reload: () => void }): JSX.Element {
  const navigation = useNavigation();
  const shortcut = action.key ? ({ modifiers: ["cmd"], key: action.key } as Keyboard.Shortcut) : undefined;
  switch (action.type) {
    case "copy":
      return (
        <Action title={action.title || "Copy"} shortcut={shortcut} onAction={async () => Clipboard.copy(action.text)} />
      );
    case "open":
      return <Action title={action.title || "Open"} shortcut={shortcut} onAction={async () => open(action.target)} />;
    case "reload":
      return <Action title={action.title || "Reload"} shortcut={shortcut} onAction={reload} />;
    case "exit":
      return <Action title={action.title || "Exit"} shortcut={shortcut} onAction={closeMainWindow} />;
    case "push":
      return <Action.Push title={action.title || ""} target={<SunbeamPage action={action} />} shortcut={shortcut} />;
    case "run": {
      return (
        <Action
          title={action.title || "Run"}
          shortcut={shortcut}
          onAction={async () => {
            if (action.inputs) {
              navigation.push(
                <SunbeamForm
                  inputs={action.inputs}
                  onSubmit={async (inputs) => {
                    try {
                      await runAction(action, inputs);
                      if (action.reloadOnSuccess) {
                        navigation.pop();
                        reload();
                      } else {
                        closeMainWindow();
                      }
                    } catch (err) {
                      showToast(Toast.Style.Failure, "Error", (err as Error).message);
                    }
                  }}
                />
              );
              return;
            }

            try {
              await runAction(action);
              if (action.reloadOnSuccess) {
                reload();
              } else {
                closeMainWindow();
              }
            } catch (err) {
              showToast(Toast.Style.Failure, "Error", (err as Error).message);
            }
          }}
        />
      );
    }
  }
}
