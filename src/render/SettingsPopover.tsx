import { DropdownSelect } from "@hoardodile/ui/components/dropdown-select"
import { SectionLabel } from "@hoardodile/ui/components/section-label"
import { Separator } from "@hoardodile/ui/components/separator"
import { Switch } from "@hoardodile/ui/components/switch"
import { useTranslation } from "../i18n"
import type {
	MangaBackground,
	MangaFitMode,
	MangaPageDirection,
	MangaReadingMode,
	MangaSettings,
} from "../prefs"

/**
 * Reader settings, grouped as a design-system popover. Discrete choices
 * use the shared `DropdownSelect`; latched booleans use `Switch`. The
 * paged-only controls (spread, fit) appear only when the mode is paged.
 */
export function MangaSettingsPopover(props: {
	readonly settings: MangaSettings
	readonly onChange: (patch: Partial<MangaSettings>) => void
}) {
	const { settings, onChange } = props
	const { t } = useTranslation()
	const paged = settings.defaultMode === "paged"

	return (
		<div
			className="flex w-64 flex-col gap-3 p-1"
			data-testid="manga-settings-panel"
		>
			<SettingsSection label={t("settingMode")}>
				<SelectRow
					label={t("settingModeValue")}
					value={settings.defaultMode}
					onChange={(v) => onChange({ defaultMode: v as MangaReadingMode })}
					options={[
						{ value: "scroll", label: t("modeScroll") },
						{ value: "paged", label: t("modePaged") },
					]}
					ariaLabel={t("settingModeValue")}
				/>
				<SelectRow
					label={t("settingDirection")}
					value={settings.pageDirection}
					onChange={(v) => onChange({ pageDirection: v as MangaPageDirection })}
					options={[
						{ value: "ltr", label: t("directionLtr") },
						{ value: "rtl", label: t("directionRtl") },
					]}
					ariaLabel={t("settingDirection")}
				/>
			</SettingsSection>

			{paged ? (
				<SettingsSection label={t("settingPaging")}>
					<SwitchRow
						label={t("spread")}
						checked={settings.spread}
						onChange={(checked) => onChange({ spread: checked })}
					/>
					<SelectRow
						label={t("settingFit")}
						value={settings.fitMode}
						onChange={(v) => onChange({ fitMode: v as MangaFitMode })}
						options={[
							{ value: "page", label: t("fitPage") },
							{ value: "width", label: t("fitWidth") },
						]}
						ariaLabel={t("settingFit")}
						disabled={settings.spread}
					/>
				</SettingsSection>
			) : null}

			<SettingsSection label={t("settingDisplay")}>
				<SelectRow
					label={t("settingBackground")}
					value={settings.background}
					onChange={(v) => onChange({ background: v as MangaBackground })}
					options={[
						{ value: "black", label: t("backgroundBlack") },
						{ value: "theme", label: t("backgroundTheme") },
						{ value: "transparent", label: t("backgroundTransparent") },
					]}
					ariaLabel={t("settingBackground")}
				/>
				<SwitchRow
					label={t("comments")}
					checked={settings.showComments}
					onChange={(checked) => onChange({ showComments: checked })}
				/>
			</SettingsSection>

			<Separator size="hairline" />
			<p className="text-xs text-muted-foreground">{t("shortcutsHint")}</p>
		</div>
	)
}

function SettingsSection(props: {
	readonly label: string
	readonly children: React.ReactNode
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<SectionLabel size="tiny">{props.label}</SectionLabel>
			{props.children}
		</div>
	)
}

function SelectRow(props: {
	readonly label: string
	readonly value: string
	readonly onChange: (value: string) => void
	readonly options: readonly {
		readonly value: string
		readonly label: string
	}[]
	readonly ariaLabel: string
	readonly disabled?: boolean
}) {
	const { label, value, onChange, options, ariaLabel, disabled = false } = props
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-xs text-foreground">{label}</span>
			<DropdownSelect
				value={value}
				onValueChange={onChange}
				options={options}
				aria-label={ariaLabel}
				disabled={disabled}
			/>
		</div>
	)
}

function SwitchRow(props: {
	readonly label: string
	readonly checked: boolean
	readonly onChange: (checked: boolean) => void
}) {
	const { label, checked, onChange } = props
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-xs text-foreground">{label}</span>
			<Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
		</div>
	)
}
