import {
  CheckIcon,
  ChevronDownIcon,
  ImageIcon,
  ImagePlusIcon,
  LanguagesIcon,
  Loader2Icon,
  MessageSquareIcon,
  PencilIcon,
  PinIcon,
  PlayIcon,
  RectangleHorizontalIcon,
  RectangleVerticalIcon,
  SettingsIcon,
  SquareIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type ConnectionStatus } from "@/hooks/use-image-console";
import { useTimedConfirmation } from "@/hooks/use-timed-confirmation";
import {
  MAX_EDIT_INPUT_IMAGES,
  MAX_IMAGE_COUNT,
  QUALITY_OPTIONS,
  SIZE_OPTION_GROUPS,
  sizeOptionDisplayLabel,
  type AppSettings,
  type ConsoleMode,
  type EditInputImage,
} from "@/lib/image-console";
import { useI18n } from "@/lib/i18n";
import { MAX_PROMPT_HISTORY, type PromptHistoryEntry } from "@/lib/prompt-history";
import { cn } from "@/lib/utils";

const DELETE_CONFIRMATION_TIMEOUT_MS = 3000;
const SIZE_GROUPS = [
  { key: "square", icon: SquareIcon, options: SIZE_OPTION_GROUPS.square },
  { key: "landscape", icon: RectangleHorizontalIcon, options: SIZE_OPTION_GROUPS.landscape },
  { key: "portrait", icon: RectangleVerticalIcon, options: SIZE_OPTION_GROUPS.portrait },
] as const;

interface HistoricalEditImageOption {
  value: string;
  label: string;
  thumbnail: { src: string } | null;
}

export interface GeneratorPanelProps {
  mode: ConsoleMode;
  editImages: EditInputImage[];
  historicalEditImageValue: string;
  historicalEditImageOptions: HistoricalEditImageOption[];
  settings: AppSettings;
  prompt: string;
  promptHistory: PromptHistoryEntry[];
  promptHistoryCount: number;
  promptHistoryPinnedCount: number;
  connectionStatus: ConnectionStatus;
  promptFocusSignal: number;
  setPrompt: (value: string) => void;
  setEditImages: Dispatch<SetStateAction<EditInputImage[]>>;
  updateSettings: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  setSettingsOpen: (open: boolean) => void;
  enqueueGeneration: (generationMode: "images" | "responses" | "completions") => boolean;
  enqueueEditGeneration: () => boolean;
  selectPromptHistory: (value: string) => void;
  deletePromptHistory: (value: string) => void;
  togglePromptHistoryPin: (value: string) => void;
  addHistoricalEditImage: (value: string) => Promise<void>;
  onModeChange: (mode: ConsoleMode) => void;
  onOpenStrictPromptEditor: () => void;
}

function clampRequestCountInput(value: unknown) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) return 1;
  return Math.min(MAX_IMAGE_COUNT, Math.max(1, parsed));
}

function OptionSelect({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onValueChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function SizeSelect({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
  const { copy } = useI18n();

  return (
    <Field>
      <FieldLabel>{copy.generator.size}</FieldLabel>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">auto</SelectItem>
          <SelectSeparator />
          {SIZE_GROUPS.map((group) => (
            <SelectGroup key={group.key}>
              <SelectLabel className="flex items-center gap-1.5">
                <group.icon aria-hidden="true" className="size-3.5 shrink-0" />
                <span>{copy.generator.sizeGroups[group.key]}</span>
              </SelectLabel>
              {group.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {sizeOptionDisplayLabel(option)}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function PromptHistoryPanel({
  promptHistory,
  promptHistoryCount,
  promptHistoryPinnedCount,
  onSelectPrompt,
  onDeletePrompt,
  onTogglePromptPin,
}: {
  promptHistory: PromptHistoryEntry[];
  promptHistoryCount: number;
  promptHistoryPinnedCount: number;
  onSelectPrompt: (value: string) => void;
  onDeletePrompt: (value: string) => void;
  onTogglePromptPin: (value: string) => void;
}) {
  const { copy } = useI18n();
  const { pendingKey: pendingDeletePrompt, requestConfirmation } = useTimedConfirmation(DELETE_CONFIRMATION_TIMEOUT_MS);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2" aria-label={copy.promptHistory.title}>
      <div className="flex items-center justify-between gap-2">
        <FieldTitle>{copy.promptHistory.title}</FieldTitle>
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {promptHistoryCount}/{MAX_PROMPT_HISTORY}
          {promptHistoryPinnedCount ? ` · ${promptHistoryPinnedCount} ${copy.promptHistory.pinned}` : ""}
        </span>
      </div>

      {promptHistory.length ? (
        <ScrollArea className="min-h-0 flex-1 rounded-md border">
          <div className="flex w-full min-w-0 flex-col">
            {promptHistory.map((item) => (
              <div
                key={item.prompt}
                className="grid w-full max-w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 overflow-hidden border-b last:border-b-0"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full min-w-0 cursor-pointer items-center overflow-hidden px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none"
                      onClick={() => onSelectPrompt(item.prompt)}
                    >
                      <span className="block min-w-0 flex-1 truncate">{item.prompt}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" sideOffset={8} className="whitespace-pre-wrap break-words text-left">
                    {item.prompt}
                  </TooltipContent>
                </Tooltip>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className={cn("shrink-0", item.pinned ? "text-primary" : "text-muted-foreground")}
                  aria-pressed={item.pinned}
                  aria-label={item.pinned ? `${copy.promptHistory.unpin}：${item.prompt}` : `${copy.promptHistory.pin} Prompt：${item.prompt}`}
                  title={item.pinned ? copy.promptHistory.unpin : copy.promptHistory.pin}
                  onClick={() => onTogglePromptPin(item.prompt)}
                >
                  <PinIcon fill={item.pinned ? "currentColor" : "none"} data-icon="inline-start" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className={cn(
                    "mr-1 shrink-0",
                    pendingDeletePrompt === item.prompt && "text-destructive hover:text-destructive",
                  )}
                  aria-label={
                    pendingDeletePrompt === item.prompt
                      ? `${copy.promptHistory.confirmDelete} ${copy.promptHistory.title}: ${item.prompt}`
                      : `${copy.promptHistory.delete} ${copy.promptHistory.title}: ${item.prompt}`
                  }
                  onClick={() => {
                    if (!requestConfirmation(item.prompt)) return;
                    onDeletePrompt(item.prompt);
                  }}
                >
                  {pendingDeletePrompt === item.prompt ? (
                    <CheckIcon data-icon="inline-start" />
                  ) : (
                    <Trash2Icon data-icon="inline-start" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="min-h-0 flex-1 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {copy.promptHistory.empty}
        </div>
      )}
    </section>
  );
}

export function GeneratorPanel({
  mode,
  editImages,
  historicalEditImageValue,
  historicalEditImageOptions,
  settings,
  prompt,
  promptHistory,
  promptHistoryCount,
  promptHistoryPinnedCount,
  connectionStatus,
  promptFocusSignal,
  setPrompt,
  setEditImages,
  updateSettings,
  setSettingsOpen,
  enqueueGeneration,
  enqueueEditGeneration,
  selectPromptHistory,
  deletePromptHistory,
  togglePromptHistoryPin,
  addHistoricalEditImage,
  onModeChange,
  onOpenStrictPromptEditor,
}: GeneratorPanelProps) {
  const { copy, toggleLanguage } = useI18n();
  const editImagesInputRef = useRef<HTMLInputElement>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const generationButtonFeedbackClassName = "transition-all duration-100 active:translate-y-px active:scale-[0.99] active:brightness-95";
  const editImageSelectionFull = editImages.length >= MAX_EDIT_INPUT_IMAGES;

  useEffect(() => {
    if (promptFocusSignal <= 0) return;

    const timeoutId = window.setTimeout(() => {
      promptTextareaRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [promptFocusSignal]);

  function submitGeneration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "edit") {
      enqueueEditGeneration();
      return;
    }

    enqueueGeneration("images");
  }

  function handleEditImagesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files || []);
    if (!files.length) return;

    const remainingSlots = Math.max(0, MAX_EDIT_INPUT_IMAGES - editImages.length);
    if (files.length > remainingSlots) {
      toast.error(copy.generator.maxEditImages(MAX_EDIT_INPUT_IMAGES));
    }

    const nextImages: EditInputImage[] = files.slice(0, remainingSlots).map((file) => ({
      src: URL.createObjectURL(file),
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      file,
    }));

    if (nextImages.length) {
      setEditImages((current) => [...current, ...nextImages].slice(0, MAX_EDIT_INPUT_IMAGES));
    }
    event.currentTarget.value = "";
  }

  function handleModeChange(value: string) {
    onModeChange(value as ConsoleMode);
  }

  return (
    <form noValidate onSubmit={submitGeneration} className="flex min-h-0 min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={mode} onValueChange={handleModeChange}>
          <TabsList className="h-10 rounded-full border border-border bg-muted/40 p-1">
            <TabsTrigger value="generate" className="rounded-full px-4 text-xs">
              {copy.generator.generate}
            </TabsTrigger>
            <TabsTrigger value="edit" className="rounded-full px-4 text-xs">
              {copy.generator.edit}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={toggleLanguage}
                aria-label={copy.switchLanguageTooltip}
              >
                <LanguagesIcon data-icon="inline-start" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copy.switchLanguageTooltip}</TooltipContent>
          </Tooltip>
          <Button
            type="button"
            variant={connectionStatus.tone === "ok" ? "secondary" : connectionStatus.tone === "error" ? "destructive" : "outline"}
            size="sm"
            onClick={() => setSettingsOpen(true)}
          >
            {connectionStatus.tone === "busy" ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <SettingsIcon data-icon="inline-start" />}
            {connectionStatus.label}
          </Button>
        </div>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="prompt">{copy.generator.promptLabel}</FieldLabel>
          <Textarea
            id="prompt"
            name="prompt"
            ref={promptTextareaRef}
            rows={4}
            maxLength={32000}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={mode === "edit" ? copy.generator.editPromptPlaceholder : copy.generator.promptPlaceholder}
            required
            className="h-[114px] resize-none overflow-y-auto md:h-[98px]"
          />
        </Field>
        {mode === "edit" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="historicalEditImages">{copy.generator.selectHistoricalImage}</FieldLabel>
              <Select
                value={historicalEditImageValue}
                onValueChange={(value) => {
                  void addHistoricalEditImage(value);
                }}
              >
                <SelectTrigger
                  id="historicalEditImages"
                  className="w-full"
                  disabled={!historicalEditImageOptions.length || editImageSelectionFull}
                >
                  <SelectValue placeholder={copy.generator.choose} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {historicalEditImageOptions.length ? (
                      historicalEditImageOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="min-h-14 items-center py-2 pr-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="flex size-9 shrink-0 overflow-hidden rounded-md border border-border bg-muted/30">
                              {option.thumbnail?.src ? (
                                <img
                                  src={option.thumbnail.src}
                                  alt=""
                                  aria-hidden="true"
                                  className="h-full w-full object-cover object-center"
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                                  <ImageIcon className="size-4" />
                                </span>
                              )}
                            </span>
                            <span className="min-w-0 truncate">{option.label}</span>
                          </span>
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="__empty" disabled>
                        {copy.generator.noHistoricalImages}
                      </SelectItem>
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="editImages">{copy.generator.selectLocalImage}</FieldLabel>
              <button
                type="button"
                className="flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground"
                disabled={editImageSelectionFull}
                onClick={() => editImagesInputRef.current?.click()}
              >
                <span className="min-w-0 flex-1 truncate text-left">{copy.generator.choose}</span>
                <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
              </button>
              <Input
                id="editImages"
                ref={editImagesInputRef}
                type="file"
                accept="image/*"
                multiple
                disabled={editImageSelectionFull}
                onChange={handleEditImagesChange}
                className="hidden"
              />
            </Field>
          </div>
        ) : null}
        {mode === "edit" ? (
          <div className="grid gap-2">
            {editImages.length ? (
              <div className="grid gap-2">
                <div
                  className="grid grid-cols-5 gap-1.5 overflow-hidden pb-1"
                  data-testid="edit-image-preview-strip"
                >
                  {editImages.map((image, index) => (
                    <div
                      key={`${image.sourceKey || image.name}-${index}`}
                      className="relative aspect-square min-w-0 overflow-hidden rounded-md border border-border bg-muted/30"
                    >
                      <img
                        src={image.src}
                        alt=""
                        aria-hidden="true"
                        className="block h-full w-full object-cover object-center"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-xs"
                        className="absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-background/90 shadow-none"
                        aria-label={`${copy.historyImage.deleteButton} ${index + 1}`}
                        onClick={() => {
                          setEditImages((current) => current.filter((_, currentIndex) => currentIndex !== index));
                        }}
                      >
                        <XIcon data-icon="inline-start" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                {copy.generator.selectAtLeastOneImage}
              </div>
            )}
          </div>
        ) : null}
      </FieldGroup>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SizeSelect value={String(settings.size)} onValueChange={(value) => updateSettings("size", value as AppSettings["size"])} />
        <OptionSelect
          label={copy.generator.quality}
          value={String(settings.quality)}
          options={QUALITY_OPTIONS}
          onValueChange={(value) => updateSettings("quality", value as AppSettings["quality"])}
        />
        <Field>
          <FieldLabel htmlFor="n">{copy.generator.count}</FieldLabel>
          <Input
            id="n"
            name="n"
            type="number"
            min={1}
            max={100}
            step={1}
            inputMode="numeric"
            value={settings.n}
            onChange={(event) => updateSettings("n", event.target.value)}
            onBlur={(event) => updateSettings("n", clampRequestCountInput(event.target.value))}
          />
        </Field>
        <Field className="gap-2 self-end">
          <FieldTitle>{copy.generator.keepOriginalPrompt}</FieldTitle>
          <div className="flex min-h-9 items-center justify-between gap-3 rounded-md border px-3 py-1">
            <label htmlFor="strictPrompt" className="flex min-w-0 cursor-pointer items-center gap-2">
              <Checkbox
                id="strictPrompt"
                checked={settings.strictPrompt}
                onCheckedChange={(checked) => updateSettings("strictPrompt", checked === true)}
              />
              <span className="min-w-0 leading-none">{copy.generator.keep}</span>
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  aria-label={copy.generator.editOriginalPromptTooltip}
                  onClick={onOpenStrictPromptEditor}
                >
                  <PencilIcon data-icon="inline-start" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{copy.generator.editOriginalPromptTooltip}</TooltipContent>
            </Tooltip>
          </div>
        </Field>
      </div>

      <PromptHistoryPanel
        promptHistory={promptHistory}
        promptHistoryCount={promptHistoryCount}
        promptHistoryPinnedCount={promptHistoryPinnedCount}
        onSelectPrompt={selectPromptHistory}
        onDeletePrompt={deletePromptHistory}
        onTogglePromptPin={togglePromptHistoryPin}
      />

      <div className="grid grid-cols-1 gap-2">
        {mode === "edit" ? (
          <Button type="submit" size="lg" className={generationButtonFeedbackClassName}>
            <ImagePlusIcon data-icon="inline-start" />
            {copy.generator.edits}
          </Button>
        ) : (
          <>
            <Button type="submit" size="lg" className={generationButtonFeedbackClassName}>
              <PlayIcon data-icon="inline-start" />
              {copy.generator.generations}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className={generationButtonFeedbackClassName}
              onClick={() => enqueueGeneration("responses")}
            >
              <ImageIcon data-icon="inline-start" />
              {copy.generator.responses}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className={generationButtonFeedbackClassName}
              onClick={() => enqueueGeneration("completions")}
            >
              <MessageSquareIcon data-icon="inline-start" />
              {copy.generator.completions}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
