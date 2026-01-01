import { Action, ActionPanel, Form, showToast, Toast } from "@vicinae/api";
import { useRef, useState } from "react";
import { Monitor } from "./hyprland-monitors";
import { POSITIONS, SCALES, TRANSFORMS } from "./config";
import { setMonitorRule } from "./api/monitor";

export const MonitorSettings = ({
  monitor,
  refreshParent,
}: MonitorSettingsProps) => {
  const revertChangesTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<number>(10);
  const [canRevert, setCanRevert] = useState(false);
  const [position, setPosition] = useState(monitor.position);
  const [mode, setMode] = useState(monitor.mode);
  const [scale, setScale] = useState(monitor.scale);
  const [transform, setTransform] = useState(monitor.transform);

  const confirmChanges = async () => {
    resetCountdown();
    refreshParent();
  };

  const revertChanges = async () => {
    resetCountdown();
    await setMonitorRule(monitor);
    refreshParent();
  };

  const resetCountdown = () => {
    if (!revertChangesTimeoutRef.current) return;
    setCanRevert(false);
    clearInterval(revertChangesTimeoutRef.current);
    countdownRef.current = 10;
    revertChangesTimeoutRef.current = null;
  };

  const handleResetCountdown = async () => {
    if (countdownRef.current !== 0) {
      showToast({
        style: Toast.Style.Success,
        title: `Reverting changes in ${countdownRef.current} seconds...`,
      });
      countdownRef.current -= 1;
      return;
    }
    revertChanges();
  };

  const handleSubmit = async () => {
    const [widthHeight, refreshRateStr] = mode!.split("@");
    const [widthStr, heightStr] = widthHeight.split("x");
    await setMonitorRule({
      ...monitor,
      width: parseInt(widthStr),
      height: parseInt(heightStr),
      refreshRate: parseInt(refreshRateStr),
      position: position,
      scale: scale,
      transform: transform,
    });
    handleResetCountdown();
    const id = setInterval(handleResetCountdown, 1000);
    revertChangesTimeoutRef.current = id;
    setCanRevert(true);
  };
  return (
    <Form
      actions={
        <ActionPanel>
          {!canRevert ? (
            <Action.SubmitForm title="Apply changes" onSubmit={handleSubmit} />
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
                  revertChanges();
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
    </Form>
  );
};

type MonitorSettingsProps = {
  monitor: Monitor;
  refreshParent: () => void;
};
