import * as sunbeam from "@pomdtr/sunbeam"
import { Action, ActionPanel, Clipboard, closeMainWindow, Detail, Form, getPreferenceValues, Icon, List, open, useNavigation } from "@raycast/api";
import { showFailureToast, useFetch } from "@raycast/utils";
import { fetch } from "cross-fetch"
import { useState, useEffect } from "react";

const preferences = getPreferenceValues<Preferences>();

export function findMissingParams(command: sunbeam.Command, params: sunbeam.Params) {
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

export function SunbeamAction(props: { action: sunbeam.Action; extension: sunbeam.Extension, onAction?: () => void }) {
  switch (props.action.type) {
    case "copy":
      return <Action.CopyToClipboard title={props.action.title} content={props.action.text} onCopy={props.onAction} />;
    case "open":
      return <Action.OpenInBrowser title={props.action.title} url={props.action.target} onOpen={props.onAction} />
    case "run":
      const action = props.action
      const command = props.extension.commands?.find((command) => command.name === action.command)
      if (!command) {
        return <Action title="Command not found" />
      }

      const missing = findMissingParams(command, props.action.params || {})
      if (missing.length > 0) {
        return <Action.Push title={props.action.title} target={<SunbeamForm extension={props.extension} command={command} params={props.action.params} />} />
      }

      switch (command.mode) {
        case "silent": {
          return <Action icon={Icon.Play} title={props.action.title} onAction={async () => {
            const resp = await fetch(new URL(`/${props.extension.name}/${command.name}`, preferences.url), {
              method: "POST",
              headers: preferences.token ? {
                Authorization: `Bearer ${preferences.token}`,
                "Content-Type": "application/json"
              } :
                {
                  "Content-Type": "application/json",
                },
              body: JSON.stringify(action.params || {}),
            })

            if (!resp.ok) {
              await showFailureToast("Failed to run command")
              return
            }

            await closeMainWindow()
          }} />
        }
        case "action": {
          return <Action icon={Icon.Play} title={props.action.title} onAction={async () => {
            const resp = await fetch(new URL(`/${props.extension.name}/${command.name}`, preferences.url), {
              method: "POST",
              headers: preferences.token ? {
                Authorization: `Bearer ${preferences.token}`,
                "Content-Type": "application/json"
              } :
                {
                  "Content-Type": "application/json",
                },
              body: JSON.stringify(action.params || {}),
            })

            const next: sunbeam.Action = await resp.json()
            if (next.type === "copy") {
              await Clipboard.copy(next.text)
              await closeMainWindow()
              return
            } else if (next.type === "open") {
              await open(next.target)
              await closeMainWindow()
              return
            } else if (next.type === "run") {
              throw new Error("Cannot chain run actions")
            }
          }
          } />
        }
        default:
          return <Action.Push icon={Icon.Play} title={props.action.title} target={<SunbeamForm command={command} extension={props.extension} params={props.action.params} />} />
      }
  }
}

export function SunbeamForm(props: {
  extension: sunbeam.Extension
  command: sunbeam.Command
  params?: sunbeam.Params
}) {
  const [params, setParams] = useState<sunbeam.Params>(props.params || {})
  const missing = findMissingParams(props.command, params)
  if (missing.length === 0) {
    return props.command.mode === "detail" ? <SunbeamDetail command={props.command} extension={props.extension} params={params} /> : <SunbeamList command={props.command} extension={props.extension} params={params} />
  }

  return <Form actions={
    <ActionPanel>
      <ActionPanel.Section>
        <Action.SubmitForm onSubmit={async (values) => {
          if (props.command.mode === "silent") {
            await fetch(new URL(`/${props.extension.name}/${props.command.name}`, preferences.url).href, {
              method: "POST",
              headers: preferences.token ? {
                Authorization: `Bearer ${preferences.token}`,
                "Content-Type": "application/json"
              } :
                {
                  "Content-Type": "application/json",
                },
              body: JSON.stringify(values),
            })

            await closeMainWindow()
            return
          } else if (props.command.mode === "action") {
            const resp = await fetch(new URL(`/${props.extension.name}/${props.command.name}`, preferences.url).href, {
              method: "POST",
              headers: preferences.token ? {
                Authorization: `Bearer ${preferences.token}`,
                "Content-Type": "application/json"
              } :
                {
                  "Content-Type": "application/json",
                },
              body: JSON.stringify(values),
            })

            if (!resp.ok) {
              await showFailureToast("Failed to run command")
              return
            }

            const action: sunbeam.Action = await resp.json()
            if (action.type == "copy") {
              await Clipboard.copy(action.text)
              await closeMainWindow()
              return
            } else if (action.type == "open") {
              await open(action.target)
              await closeMainWindow()
              return
            } else if (action.type == "run") {
              throw new Error("Cannot chain run actions")
            }
          }

          setParams({ ...params, ...values })
        }} title="Run" />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <CreateQuickLinkAction name={props.command.description} extension={props.extension.name} command={props.command.name} params={params} />
      </ActionPanel.Section>
    </ActionPanel>
  }>
    {missing.map((param) => {
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

export function SunbeamList(props: { extension: sunbeam.Extension; command: sunbeam.Command; params?: sunbeam.Params }) {
  const [searchText, setSearchText] = useState<string>()

  const { data: list, isLoading, mutate } = useFetch<sunbeam.List>(new URL(`/${props.extension.name}/${props.command.name}`, preferences.url).href, {
    keepPreviousData: true,
    method: "POST",
    headers: preferences.token ? {
      Authorization: `Bearer ${preferences.token}`,
      "Content-Type": "application/json"
    } :
      {
        "Content-Type": "application/json",
      },
    body: JSON.stringify({
      ...props.params,
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
    throttle={props.command.mode === "search"}
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
              <SunbeamAction key={idx} action={action} extension={props.extension} />
            ))}
          </ActionPanel.Section>
          <ActionPanel.Section>
            <CreateQuickLinkAction name={props.command.description} extension={props.extension.name} command={props.command.name} params={props.params} />
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

export function SunbeamDetail(props: { command: sunbeam.Command, extension: sunbeam.Extension, params?: sunbeam.Params }) {
  const { data: detail, isLoading, mutate } = useFetch<sunbeam.Detail>(new URL(`/${props.extension.name}/${props.command.name}`, preferences.url).href, {
    method: "POST",
    headers: preferences.token ? {
      Authorization: `Bearer ${preferences.token}`,
      "Content-Type": "application/json"
    } :
      {
        "Content-Type": "application/json",
      },
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
              <SunbeamAction key={idx} action={action} extension={props.extension} />
            ))}
          </ActionPanel.Section>
          <ActionPanel.Section>
            <CreateQuickLinkAction name={props.command.description} extension={props.extension.name} command={props.command.name} params={props.params} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

export function CreateQuickLinkAction({ name, extension, command, params }: { name?: string, extension: string, command: string, params?: sunbeam.Params }) {
  let link = `raycast://extensions/pomdtr/sunbeam/run-command?arguments=${encodeURIComponent(JSON.stringify({ extension, command, }))}`
  if (params) {
    link += `&launchContext=${encodeURIComponent(JSON.stringify({ params }))}`
  }
  return <Action.CreateQuicklink title={"Create QuickLink"} quicklink={{ name, link, }} />
}
