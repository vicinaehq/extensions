import {
  Action,
  ActionPanel,
  Form,
  showToast,
  Toast,
  closeMainWindow,
} from "@vicinae/api";
import { useRef, useState } from "react";
import { Monitor } from "./hyprland-monitors";
import { PERSIST_CHANGES, POSITIONS, SCALES, TRANSFORMS } from "./config";
import {
  getMonitors,
  setMonitorPersistRule,
  setMonitorRule,
} from "./api/monitor";
import { getIsPersistSetup } from "./api/hyprlandConfig";
import { SetupGuide } from "./SetupGuide";

export default function MonitorSettings({
  monitor: _monitor,
  refreshParent,
}: MonitorSettingsProps) {
  const revertChangesTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<number>(10);
  const focusedMonitor = getMonitors().find((m) => m.focused);
  const monitor = _monitor ?? focusedMonitor;

  if (!monitor) return;

  const [isPersistSetup, setIsPersistSetup] = useState(getIsPersistSetup());
  const [canRevert, setCanRevert] = useState(false);
  const [position, setPosition] = useState(monitor.position);
  const [mode, setMode] = useState(monitor.mode);
  const [scale, setScale] = useState(monitor.scale);
  const [transform, setTransform] = useState(monitor.transform);

  const confirmChanges = async () => {
    resetCountdown();
    refreshParent ? refreshParent() : closeMainWindow();
  };

  const revertChanges = (persist: boolean) => {
    const updateMonitor = persist ? setMonitorPersistRule : setMonitorRule;

    resetCountdown();
    updateMonitor(monitor);
    refreshParent?.();
  };

  const resetCountdown = () => {
    if (!revertChangesTimeoutRef.current) return;
    setCanRevert(false);
    clearInterval(revertChangesTimeoutRef.current);
    countdownRef.current = 10;
    revertChangesTimeoutRef.current = null;
  };

  const handleResetCountdown = (persist: boolean) => {
    if (countdownRef.current !== 0) {
      showToast({
        style: Toast.Style.Success,
        title: `Reverting changes in ${countdownRef.current} seconds...`,
      });
      countdownRef.current -= 1;
      return;
    }
    revertChanges(persist);
  };

  const handleSubmit = (persist: boolean) => {
    const [widthHeight, refreshRateStr] = mode!.split("@");
    const [widthStr, heightStr] = widthHeight.split("x");

    const updateMonitor = persist ? setMonitorPersistRule : setMonitorRule;

    updateMonitor({
      ...monitor,
      width: parseInt(widthStr),
      height: parseInt(heightStr),
      refreshRate: parseInt(refreshRateStr),
      position: position,
      scale: scale,
      transform: transform,
    });
    handleResetCountdown(persist);
    const id = setInterval(() => handleResetCountdown(persist), 1000);
    revertChangesTimeoutRef.current = id;
    setCanRevert(true);
  };

  if (PERSIST_CHANGES && !isPersistSetup)
    return <SetupGuide setIsPersistSetup={setIsPersistSetup} />;
  return (
    <Form
      actions={
        <ActionPanel>
          {!canRevert ? (
            <>
              <Action.SubmitForm
                title={PERSIST_CHANGES ? "Apply and Save" : "Apply changes"}
                onSubmit={() => handleSubmit(PERSIST_CHANGES)}
              />
              <Action
                title={!PERSIST_CHANGES ? "Apply and Save" : "Apply changes"}
                onAction={() => handleSubmit(!PERSIST_CHANGES)}
              />
            </>
          ) : (
            <>
              <Action
                title="Keep changes"
                onAction={() => {
                  confirmChanges();
                }}
              />
              <Action
                title="Revert changes"
                onAction={() => {
                  revertChanges(PERSIST_CHANGES);
                }}
              />
            </>
          )}
        </ActionPanel>
      }
    >
      <Form.Description text={monitor.description} title="Monitor name" />
      <Form.Description text={monitor.name} title="Port" />
      <Form.Dropdown
        id="resolution"
        title="Resolution"
        onChange={setMode}
        value={mode}
      >
        {monitor.availableModes.map((mode) => {
          return <Form.Dropdown.Item key={mode} title={mode} value={mode} />;
        })}
      </Form.Dropdown>
      <Form.Dropdown
        id="scale"
        title="Scale"
        onChange={(value) => {
          setScale(parseFloat(value));
        }}
        value={scale?.toString()}
      >
        {SCALES.map((scale) => {
          return (
            <Form.Dropdown.Item
              key={scale}
              title={scale.toString()}
              value={scale.toString()}
            />
          );
        })}
      </Form.Dropdown>
      <Form.Dropdown
        id="transform"
        title="Transform"
        onChange={(value) => {
          setTransform(parseFloat(value));
        }}
        value={transform?.toString()}
      >
        {TRANSFORMS.map((transform) => {
          return (
            <Form.Dropdown.Item
              key={transform.value}
              title={transform.label}
              value={transform.value.toString()}
            />
          );
        })}
      </Form.Dropdown>
      {PERSIST_CHANGES && (
        <Form.Dropdown
          id="positioning"
          title="Positioning"
          onChange={setPosition}
          value={position}
        >
          {POSITIONS.map((pos) => {
            return (
              <Form.Dropdown.Item
                key={pos.value}
                title={pos.label}
                keywords={[pos.label]}
                value={pos.value}
              />
            );
          })}
        </Form.Dropdown>
      )}
    </Form>
  );
}

type MonitorSettingsProps = {
  monitor?: Monitor;
  refreshParent?: () => void;
};
