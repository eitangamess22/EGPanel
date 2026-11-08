export const brandDefaults = {
  panelName: "EGPanel",
  accentColor: "#3B82F6",
  logoText: "EG",
};

export const serverScopes = [
  "server.read",
  "server.write",
  "server.create",
  "server.delete",
  "server.power",
  "server.startup.read",
  "server.startup.write",
  "server.network.read",
  "server.network.write",
  "server.file.read",
  "server.file.write",
  "backup.read",
  "backup.create",
  "backup.restore",
  "backup.download",
  "backup.write",
  "backup.delete",
  "schedule.read",
  "schedule.write",
  "subuser.read",
  "subuser.write",
] as const;
