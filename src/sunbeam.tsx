import {
  Keyboard,
  Action,
  ActionPanel,
  Detail,
  Form,
  List,
  closeMainWindow,
  Clipboard,
  open,
  getPreferenceValues,
} from "@raycast/api";
import { useEffect, useState } from "react";
import * as sunbeam from "sunbeam-types";
import { execa } from "execa";

const { shell } = getPreferenceValues<ExtensionPreferences>();

async function triggerAction(action: sunbeam.Action) {
  const input = JSON.stringify(action);

  const { stdout, exitCode, stderr } = await execa(shell, ["-lc", "sunbeam trigger"], {
    input,
  });

  if (exitCode !== 0) {
    throw new Error(`Failed to trigger action: ${stderr}`);
  }

  return stdout;
}

async function refreshPreview(detail: {
  command?: sunbeam.Command;
  request?: sunbeam.Request;
  text?: string;
  file?: string;
  expression?: sunbeam.Expression;
}): Promise<string> {
  if (detail.text) {
    return detail.text;
  }

  let detailAction: sunbeam.Action;
  if (detail.command) {
    detailAction = { type: "run", command: detail.command };
  } else if (detail.request) {
    detailAction = { type: "fetch", request: detail.request };
  } else if (detail.expression) {
    detailAction = { type: "eval", expression: detail.expression };
  } else {
    throw new Error(`Unknown detail type: ${JSON.stringify(detail)}`);
  }

  console.debug("Refreshing preview", detailAction);
  return await triggerAction(detailAction);
}

export function SunbeamPage(props: { action: sunbeam.Action }) {
  const [page, setPage] = useState<sunbeam.Page>();
  const [inputs, setInputs] = useState<Record<string, string>>();

  const action = props.action;

  useEffect(() => {
    triggerAction(action)
      .then((result) => JSON.parse(result))
      .then((result) => setPage(result))
      .catch(console.error);
  }, []);

  if (action.inputs && action.inputs.length > 0 && !inputs) {
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
            triggerAction(action)
              .then((result) => JSON.parse(result))
              .then((result) => setPage(result))
              .catch(console.error);
          }}
        />
      );
    case "form":
      return (
        <SunbeamForm
          inputs={page.submitAction.inputs || []}
          onSubmit={(values) => {
            console.log(values);
          }}
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

    if (!item?.detail) {
      return;
    }

    refreshPreview(item?.detail).then((result) => setDetail(result));
  }, [selected]);

  return (
    <List
      navigationTitle={props.list.title}
      isShowingDetail={props.list.showDetail}
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
    refreshPreview(props.detail).then(setMarkdown);
  }, []);

  return (
    <Detail
      navigationTitle={props.detail.title}
      markdown={markdown}
      actions={
        <ActionPanel>
          {props.detail.actions?.map((action, idx) => (
            <SunbeamAction
              key={idx}
              action={action}
              reload={() => {
                refreshPreview(props.detail).then(setMarkdown);
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
  const shortcut = action.key ? ({ modifiers: ["cmd"], key: action.key } as Keyboard.Shortcut) : undefined;
  switch (action.type) {
    case "copy":
      return (
        <Action
          title={action.title || "Copy"}
          shortcut={shortcut}
          onAction={async () => {
            await Clipboard.copy(action.text);
            await closeMainWindow();
          }}
        />
      );
    case "paste":
      return (
        <Action
          title={action.title || "Paste"}
          shortcut={shortcut}
          onAction={async () => {
            await Clipboard.paste(action.text);
            await closeMainWindow();
          }}
        />
      );
    case "open":
      return <Action title={action.title || "Open"} shortcut={shortcut} onAction={async () => open(action.target)} />;
    case "reload":
      return <Action title={action.title || "Reload"} shortcut={shortcut} onAction={reload} />;
    case "push":
      return <Action.Push title={action.title || ""} target={<SunbeamPage action={action} />} shortcut={shortcut} />;
    case "run":
    case "fetch":
    case "eval":
      return (
        <Action
          title={action.title || "Eval"}
          shortcut={shortcut}
          onAction={async () => {
            const output = await triggerAction(action);
            console.log(output);
          }}
        />
      );
  }
}
