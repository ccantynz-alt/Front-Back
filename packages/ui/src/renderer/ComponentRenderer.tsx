import { type JSX, For, Show, Switch, Match } from "solid-js";
import type { Component as ComponentConfig, Tabs as TabsConfig } from "@cronix/schemas";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Card } from "../components/Card";
import { Stack } from "../components/Stack";
import { Text } from "../components/Text";
import { Modal } from "../components/Modal";
import { Badge } from "../components/Badge";
import { Alert } from "../components/Alert";
import { Avatar } from "../components/Avatar";
import { Tabs } from "../components/Tabs";
import { Select } from "../components/Select";
import { Textarea } from "../components/Textarea";
import { Spinner } from "../components/Spinner";
import { Tooltip } from "../components/Tooltip";
import { Separator } from "../components/Separator";
import { Toggle } from "../components/Toggle";

export interface ComponentRendererProps {
  config: ComponentConfig;
}

/**
 * Renders an array of child component configs recursively.
 */
function renderChildren(children: ComponentConfig[] | undefined): JSX.Element {
  return (
    <Show when={children && children.length > 0}>
      <For each={children}>{(child) => <ComponentRenderer config={child} />}</For>
    </Show>
  );
}

/**
 * ComponentRenderer: The generative UI engine.
 *
 * Takes a JSON component config (validated against ComponentSchema)
 * and renders the corresponding SolidJS component from the UI library.
 * Handles recursive children for container components (Card, Stack, Modal, Alert, Tooltip).
 */
export function ComponentRenderer(props: ComponentRendererProps): JSX.Element {
  return (
    <Switch
      fallback={
        <div
          role="alert"
          class="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800"
        >
          Unknown component type: {(props.config as Record<string, unknown>).component as string}
        </div>
      }
    >
      <Match when={props.config.component === "Button" && props.config}>
        {(config) => {
          const c = config();
          return (
            <Button
              variant={c.props.variant}
              size={c.props.size}
              disabled={c.props.disabled}
              loading={c.props.loading}
              label={c.props.label}
            />
          );
        }}
      </Match>

      <Match when={props.config.component === "Input" && props.config}>
        {(config) => {
          const c = config();
          return (
            <Input
              type={c.props.type}
              placeholder={c.props.placeholder}
              label={c.props.label}
              required={c.props.required}
              disabled={c.props.disabled}
              error={c.props.error}
              name={c.props.name}
            />
          );
        }}
      </Match>

      <Match when={props.config.component === "Card" && props.config}>
        {(config) => {
          const c = config();
          return (
            <Card
              title={c.props.title}
              description={c.props.description}
              padding={c.props.padding}
            >
              {renderChildren(c.children)}
            </Card>
          );
        }}
      </Match>

      <Match when={props.config.component === "Stack" && props.config}>
        {(config) => {
          const c = config();
          return (
            <Stack
              direction={c.props.direction}
              gap={c.props.gap}
              align={c.props.align}
              justify={c.props.justify}
            >
              {renderChildren(c.children)}
            </Stack>
          );
        }}
      </Match>

      <Match when={props.config.component === "Text" && props.config}>
        {(config) => {
          const c = config();
          return (
            <Text
              content={c.props.content}
              variant={c.props.variant}
              weight={c.props.weight}
              align={c.props.align}
            />
          );
        }}
      </Match>

      <Match when={props.config.component === "Modal" && props.config}>
        {(config) => {
          const c = config();
          return (
            <Modal
              title={c.props.title}
              description={c.props.description}
              open={c.props.open}
              size={c.props.size}
            >
              {renderChildren(c.children)}
            </Modal>
          );
        }}
      </Match>

      <Match when={props.config.component === "Badge" && props.config}>
        {(config) => {
          const c = config();
          return (
            <Badge variant={c.props.variant} size={c.props.size} label={c.props.label} />
          );
        }}
      </Match>

      <Match when={props.config.component === "Alert" && props.config}>
        {(config) => {
          const c = config();
          return (
            <Alert
              variant={c.props.variant}
              title={c.props.title}
              description={c.props.description}
              dismissible={c.props.dismissible}
            >
              {renderChildren(c.children)}
            </Alert>
          );
        }}
      </Match>

      <Match when={props.config.component === "Avatar" && props.config}>
        {(config) => {
          const c = config();
          return (
            <Avatar
              src={c.props.src}
              alt={c.props.alt}
              initials={c.props.initials}
              size={c.props.size}
            />
          );
        }}
      </Match>

      <Match when={props.config.component === "Tabs" && props.config}>
        {(config) => {
          const c = config() as TabsConfig;
          const tabItems = c.props.items.map((item) => {
            const tabItem: { id: string; label: string; content: JSX.Element; disabled?: boolean } = {
              id: item.id,
              label: item.label,
              content: (<span>{item.label}</span>) as JSX.Element,
            };
            if (item.disabled != null) {
              tabItem.disabled = item.disabled;
            }
            return tabItem;
          });
          return (
            <Tabs
              items={tabItems}
              {...(c.props.defaultTab != null ? { defaultTab: c.props.defaultTab } : {})}
            />
          );
        }}
      </Match>

      <Match when={props.config.component === "Select" && props.config}>
        {(config) => {
          const c = config();
          return (
            <Select
              options={c.props.options}
              value={c.props.value}
              placeholder={c.props.placeholder}
              label={c.props.label}
              error={c.props.error}
              disabled={c.props.disabled}
              name={c.props.name}
            />
          );
        }}
      </Match>

      <Match when={props.config.component === "Textarea" && props.config}>
        {(config) => {
          const c = config();
          return (
            <Textarea
              label={c.props.label}
              error={c.props.error}
              placeholder={c.props.placeholder}
              rows={c.props.rows}
              resize={c.props.resize}
              required={c.props.required}
              disabled={c.props.disabled}
              name={c.props.name}
            />
          );
        }}
      </Match>

      <Match when={props.config.component === "Separator" && props.config}>
        {(config) => {
          const c = config();
          return <Separator orientation={c.props.orientation} />;
        }}
      </Match>

      <Match when={props.config.component === "Spinner" && props.config}>
        {(config) => {
          const c = config();
          return <Spinner size={c.props.size} />;
        }}
      </Match>

      <Match when={props.config.component === "Tooltip" && props.config}>
        {(config) => {
          const c = config();
          return (
            <Tooltip content={c.props.content} position={c.props.position}>
              {renderChildren(c.children)}
            </Tooltip>
          );
        }}
      </Match>

      <Match when={props.config.component === "Toggle" && props.config}>
        {(config) => {
          const c = config();
          return (
            <Toggle
              checked={c.props.checked}
              disabled={c.props.disabled}
              label={c.props.label}
              description={c.props.description}
              size={c.props.size}
              name={c.props.name}
            />
          );
        }}
      </Match>
    </Switch>
  );
}
