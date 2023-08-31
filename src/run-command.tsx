import { LaunchProps } from "@raycast/api";
import { SunbeamPage } from "./sunbeam";

export default function RunCommand(props: LaunchProps<{ arguments: Arguments.RunCommand }>) {
  return <SunbeamPage action={{ type: "push", command: props.arguments.command }} />;
}
