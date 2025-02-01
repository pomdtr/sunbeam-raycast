import * as sunbeam from "@pomdtr/sunbeam"
import { Action, ActionPanel, closeMainWindow, Detail, Form, getPreferenceValues, Icon, List, useNavigation } from "@raycast/api";
import { useFetch } from "@raycast/utils";
import { useState, useEffect } from "react";

const preferences = getPreferenceValues<Preferences>();

function findMissingParams(command: sunbeam.Command, params: sunbeam.Params) {
  const missing: sunbeam.ParamDef[] = []

  for (const param of command.params || []) {
    if (param.optional) {
      continue
    }

    if (param.name in params) {
      continue
    }

    missing.push(param)
  }

  return missing
}

export function SunbeamAction({ action, extension, onAction, onReload: reload }: { action: sunbeam.Action; extension: sunbeam.Extension, onAction?: () => void, onReload?: (params?: sunbeam.Params) => void }) {
  switch (action.type) {
    case "copy":
      return <Action.CopyToClipboard title={action.title} content={action.text} onCopy={onAction} />;
    case "open":
      return <Action.OpenInBrowser title={action.title} url={action.url} />
    case "reload":
      return <Action icon={Icon.ArrowClockwise} title={action.title} onAction={reload ? () => reload(action.params || {}) : undefined} />
    case "run":
      const command = extension.commands?.find((command) => command.name === action.command)
      if (!command) {
        return <Action title="Command not found" />
      }

      const missing = findMissingParams(command, action.params || {})
      if (missing.length > 0) {
        return <Action.Push title={action.title} target={<SunbeamForm extension={extension} command={command} params={action.params} />} />
      }


      switch (command.mode) {
        case "silent":
          return <Action icon={Icon.Play} title={action.title} onAction={async () => {
            await fetch(new URL(`/extensions/${extension.name}/${command.name}`, preferences.url), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(action.params || {}),
            })

            await closeMainWindow()
          }} />
        case "filter":
        case "search":
          return <Action.Push icon={Icon.Play} title={action.title} target={<SunbeamList command={command} extension={extension} params={action.params} />} />
        case "detail":
          return <Action.Push icon={Icon.Play} title={action.title} target={<SunbeamDetail command={command} extension={extension} params={action.params} />} />
      }
  }
}

function SunbeamForm(props: {
  extension: sunbeam.Extension
  command: sunbeam.Command
  params?: sunbeam.Params
}) {
  const [params, setParams] = useState<sunbeam.Params>(props.params || {})
  const missing = findMissingParams(props.command, params)
  if (missing.length === 0) {
    return props.command.mode === "search" ? <SunbeamList command={props.command} extension={props.extension} params={params} /> : <SunbeamDetail command={props.command} extension={props.extension} params={params} />
  }

  return <Form actions={
    <ActionPanel>
      <Action.SubmitForm onSubmit={async (values) => {
        if (props.command.mode === "silent") {
          await fetch(new URL(`/extensions/${props.extension.name}/${props.command.name}`, preferences.url).href, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
          })

          await closeMainWindow()
          return
        }

        setParams({ ...params, ...values })
      }} title="Run" />
    </ActionPanel>
  }>
    {missing.map((param, idx) => {
      switch (param.type) {
        case "string":
          return <Form.TextField key={param.name} id={param.name} title={param.name} placeholder={param.description} />
        case "number":
          return <Form.TextField key={param.name} id={param.name} title={param.name} placeholder={param.description} />
        case "boolean":
          return <Form.Checkbox key={param.name} id={param.name} title={param.name} label={param.description || ""} />
      }

    })}
  </Form>
}

function SunbeamList(props: { extension: sunbeam.Extension; command: sunbeam.Command; params?: sunbeam.Params }) {
  const [params, setParams] = useState<sunbeam.Params>(props.params || {})
  const [searchText, setSearchText] = useState<string>()

  const { data: list, isLoading, mutate } = useFetch<sunbeam.List>(new URL(`/extensions/${props.extension.name}/${props.command.name}`, preferences.url).href, {
    keepPreviousData: true,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...params,
      query: searchText
    }),
  })

  useEffect(() => {
    if (!list?.autoRefreshSeconds) {
      return;
    }

    const interval = setInterval(() => {
      mutate()
    }, list.autoRefreshSeconds * 1000)

    return () => clearInterval(interval)
  }, [])

  return <List
    isLoading={isLoading}
    throttle
    isShowingDetail={list?.showDetail}
    onSearchTextChange={props.command.mode === "search" ? setSearchText : undefined}
  >
    <List.EmptyView title={list?.emptyText} />
    {list?.items?.map((item, idx) => <List.Item
      key={idx}
      title={item.title}
      subtitle={item.subtitle}
      accessories={item.accessories?.map((accessory) => ({ text: accessory }))}
      detail={<ListItemDetail detail={item.detail} />}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {item.actions?.map((action, idx) => (
              <SunbeamAction key={idx} action={action} extension={props.extension} onReload={(params) => {
                if (params) {
                  setParams(params)
                  return
                }

                mutate()
              }} />
            ))}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />)}
  </List>
}

function ListItemDetail({ detail }: { detail: sunbeam.ListItem["detail"] }) {
  if (!detail) {
    return null;
  }

  if ("markdown" in detail) {
    return <Detail markdown={detail.markdown} />
  }

  const markdown = ["```", detail.text, "```"].join("\n");
  return <Detail markdown={markdown} />
}

function SunbeamDetail(props: { command: sunbeam.Command, extension: sunbeam.Extension, params?: sunbeam.Params }) {
  const { data: detail, isLoading, mutate } = useFetch<sunbeam.Detail>(new URL(`/extensions/${props.extension.name}/${props.command.name}`, preferences.url).href, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(props.params || {}),
  })

  let markdown: string | undefined;
  if (detail?.markdown) {
    markdown = detail.markdown;
  } else if (detail?.text) {
    markdown = ["```", detail.text, "```"].join("\n");
  }

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {detail?.actions?.map((action, idx) => (
              <SunbeamAction key={idx} action={action} extension={props.extension} onReload={() => mutate()} />
            ))}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
