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
  Clipboard,
  open,
} from "@raycast/api";
import { useEffect, useState } from "react";
import * as sunbeam from "sunbeam-types";
import fetch from "cross-fetch";

function fetchVal(expression: string) {
  return fetch(`https://api.val.town/v1/eval`, {
    method: "POST",
    body: JSON.stringify({ code: expression }),
  });
}

async function refreshPreview(preview: sunbeam.Preview): Promise<string> {
  if (preview.text) {
    return preview.text;
  }

  const command = preview.command;
  if (command) {
    return "Unsupported";
  }

  const request = preview.request;
  if (request) {
    if (typeof request === "string") {
      const res = await fetch(request);
      return res.text();
    }

    const res = await fetch(request.url, { method: request.method, body: request.body, headers: request.headers });
    return res.text();
  }

  if (preview.expression) {
    const res = await fetchVal(preview.expression);
    return res.text();
  }

  throw new Error(`Unknown preview type: ${JSON.stringify(preview)}`);
}

export function SunbeamPage(props: { action: sunbeam.Action }) {
  const [page, setPage] = useState<sunbeam.Page>();
  const [inputs, setInputs] = useState<Record<string, string>>();
  const [query, setQuery] = useState<string>();
  console.log("SunbeamPage", page);

  const action = props.action;

  if (action.type !== "eval") {
    return <Detail markdown={"Unsupported action type: " + props.action.type} />;
  }

  useEffect(() => {
    fetchVal(action.expression)
      .then((res) => res.json())
      .then(setPage)
      .catch((err) => {
        showToast(Toast.Style.Failure, "Error", (err as Error).message);
      });
  }, []);

  useEffect(() => {
    if (page?.type !== "list" || typeof page.onQueryChange === "undefined") {
      return;
    }

    if (!query) {
      return;
    }
  }, [query]);

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
            fetchVal(action.expression)
              .then((res) => res.json())
              .then(setPage)
              .catch((err) => {
                showToast(Toast.Style.Failure, "Error", (err as Error).message);
              });
          }}
          onSearchTextChange={page.onQueryChange ? setQuery : undefined}
        />
      );
    case "form":
      return <SunbeamForm inputs={page.submitAction.inputs || []} onSubmit={(values) => console.log(values)} />;

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
      navigationTitle={props.list.title}
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
      navigationTitle={props.detail.title}
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
    case "fetch":
    case "run":
      return <Action title={"Unsupported Action"} />;
    case "eval":
      return (
        <Action
          title={action.title || "Eval"}
          shortcut={shortcut}
          onAction={async () => {
            const res = await fetchVal(action.expression);
            const text = await res.text();
            switch (action.onSuccess) {
              case "copy":
                await Clipboard.copy(text);
                break;
              case "paste":
                await Clipboard.paste(text);
                break;
              case "reload":
                reload();
                break;
              case "open":
                open(text);
                break;
            }
          }}
        />
      );
  }
}
