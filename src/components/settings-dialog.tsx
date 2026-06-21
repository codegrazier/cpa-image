import { CheckCircle2Icon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldGroup, FieldLabel, FieldSet, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type ConnectionStatus } from "@/hooks/use-image-console";
import { DEFAULTS, type AppSettings } from "@/lib/image-console";
import { useI18n } from "@/lib/i18n";

export interface SettingsDialogProps {
  settings: AppSettings;
  settingsOpen: boolean;
  endpointPreview: string;
  testConnectionStatus: ConnectionStatus;
  setSettingsOpen: (open: boolean) => void;
  updateSettings: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  saveCurrentSettings: () => void;
  resetSettings: () => void;
  testConnection: () => void;
}

export function SettingsDialog({
  settings,
  settingsOpen,
  endpointPreview,
  testConnectionStatus,
  setSettingsOpen,
  updateSettings,
  saveCurrentSettings,
  resetSettings,
  testConnection,
}: SettingsDialogProps) {
  const { copy } = useI18n();
  const [crossOriginProxyConfirmOpen, setCrossOriginProxyConfirmOpen] = useState(false);

  function handleSettingsOpenChange(open: boolean) {
    if (!open) {
      setCrossOriginProxyConfirmOpen(false);
    }
    setSettingsOpen(open);
  }

  function handleCrossOriginProxyChange(checked: boolean | "indeterminate") {
    if (checked === true) {
      setCrossOriginProxyConfirmOpen(true);
      return;
    }

    updateSettings("enableCrossOriginProxy", false);
  }

  function handleCrossOriginProxyConfirm() {
    updateSettings("enableCrossOriginProxy", true);
    setCrossOriginProxyConfirmOpen(false);
  }

  return (
    <>
      <Dialog open={settingsOpen} onOpenChange={handleSettingsOpenChange}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{copy.settings.title}</DialogTitle>
            <DialogDescription>{copy.settings.description}</DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="baseUrl">{copy.settings.apiUrl}</FieldLabel>
              <Input
                id="baseUrl"
                type="url"
                spellCheck={false}
                autoComplete="url"
                placeholder={DEFAULTS.baseUrl}
                value={settings.baseUrl}
                onChange={(event) => updateSettings("baseUrl", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="apiKey">{copy.settings.apiKey}</FieldLabel>
              <Input
                id="apiKey"
                type="password"
                spellCheck={false}
                autoComplete="off"
                placeholder="api-key"
                value={settings.apiKey}
                onChange={(event) => updateSettings("apiKey", event.target.value)}
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="generationsModel">{copy.settings.generationsModel}</FieldLabel>
                <Input
                  id="generationsModel"
                  type="text"
                  spellCheck={false}
                  value={settings.generationsModel}
                  onChange={(event) => updateSettings("generationsModel", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="editsModel">{copy.settings.editsModel}</FieldLabel>
                <Input
                  id="editsModel"
                  type="text"
                  spellCheck={false}
                  value={settings.editsModel}
                  onChange={(event) => updateSettings("editsModel", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="responsesModel">{copy.settings.responsesModel}</FieldLabel>
                <Input
                  id="responsesModel"
                  type="text"
                  spellCheck={false}
                  value={settings.responsesModel}
                  onChange={(event) => updateSettings("responsesModel", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="completionsModel">{copy.settings.completionsModel}</FieldLabel>
                <Input
                  id="completionsModel"
                  type="text"
                  spellCheck={false}
                  value={settings.completionsModel}
                  onChange={(event) => updateSettings("completionsModel", event.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="requestConcurrency">{copy.settings.concurrency}</FieldLabel>
                <Input
                  id="requestConcurrency"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  inputMode="numeric"
                  value={settings.requestConcurrency}
                  onChange={(event) => updateSettings("requestConcurrency", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="requestIntervalSeconds">{copy.settings.interval}</FieldLabel>
                <Input
                  id="requestIntervalSeconds"
                  type="number"
                  min={0}
                  max={3600}
                  step={1}
                  inputMode="numeric"
                  value={settings.requestIntervalSeconds}
                  onChange={(event) => updateSettings("requestIntervalSeconds", event.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field orientation="horizontal" className="!items-center">
                <Checkbox
                  id="rememberKey"
                  checked={settings.rememberKey}
                  onCheckedChange={(checked) => updateSettings("rememberKey", checked === true)}
                />
                <FieldContent>
                  <FieldLabel htmlFor="rememberKey">{copy.settings.rememberKey}</FieldLabel>
                </FieldContent>
              </Field>
              <Field orientation="horizontal" className="!items-center">
                <Checkbox
                  id="enableCrossOriginProxy"
                  checked={settings.enableCrossOriginProxy}
                  onCheckedChange={handleCrossOriginProxyChange}
                />
                <FieldContent>
                  <FieldLabel htmlFor="enableCrossOriginProxy">{copy.settings.crossOriginProxy}</FieldLabel>
                </FieldContent>
              </Field>
            </div>
            <FieldSet>
              <FieldTitle>{copy.settings.endpointPreview}</FieldTitle>
              <pre className="min-w-0 whitespace-pre-wrap break-all rounded-md border bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                {endpointPreview}
              </pre>
            </FieldSet>
          </FieldGroup>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={resetSettings}>
              <RotateCcwIcon data-icon="inline-start" />
              {copy.settings.reset}
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant={
                  testConnectionStatus.tone === "ok"
                    ? "secondary"
                    : testConnectionStatus.tone === "error"
                      ? "destructive"
                      : "outline"
                }
                className="w-28 justify-center"
                onClick={testConnection}
              >
                {testConnectionStatus.tone === "busy" ? (
                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                ) : (
                  <CheckCircle2Icon data-icon="inline-start" />
                )}
                {testConnectionStatus.label}
              </Button>
              <Button type="button" onClick={saveCurrentSettings}>
                {copy.settings.save}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={crossOriginProxyConfirmOpen} onOpenChange={setCrossOriginProxyConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">{copy.settings.crossOriginProxyConfirm.title}</AlertDialogTitle>
            <AlertDialogDescription>{copy.settings.crossOriginProxyConfirm.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.clearDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCrossOriginProxyConfirm}
              className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary/20"
            >
              {copy.settings.crossOriginProxyConfirm.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
