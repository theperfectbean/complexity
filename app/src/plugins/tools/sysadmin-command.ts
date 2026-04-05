import { commandRegistry } from "@/plugins/commandRegistry";
import { runSysadminAction } from "./sysadmin-action";

let registered = false;

export function registerSysadminCommand() {
  if (registered) return;
  registered = true;

  commandRegistry.register({
    id: "sysadmin",
    trigger: "sysadmin",
    label: "Sysadmin",
    description: "Run commands on the cluster via Claude + SSH",
    action: (context) => runSysadminAction("sysadmin", context),
  });
}
