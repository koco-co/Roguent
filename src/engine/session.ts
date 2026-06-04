import type { RoomEvent } from "../shared/events";
import { Driver, type DriverCallbacks, type IDriver } from "./driver";
import { Sequencer } from "./sequencer";

export type DriverFactory = (
  cb: DriverCallbacks,
  model: string,
  cwd: string,
) => IDriver;
export type EventSink = (e: RoomEvent) => void;

const defaultFactory: DriverFactory = (cb, model, cwd) =>
  new Driver(cb, model, cwd);

export class SessionManager {
  private seq = new Sequencer();
  private drivers = new Map<string, IDriver>();
  private sinks = new Set<EventSink>();

  constructor(
    private driverFactory: DriverFactory = defaultFactory,
    private cwd: string = process.cwd(),
  ) {}

  subscribe(sink: EventSink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  private emit(e: RoomEvent): void {
    for (const sink of this.sinks) sink(e);
  }

  createSession(id: string, opts: { title: string; model: string }): void {
    const cb: DriverCallbacks = {
      onDraft: (drafts, ts) => {
        for (const d of drafts) {
          this.emit(this.seq.stamp(id, d.type, d.payload, ts, d.agentId));
        }
      },
    };
    const driver = this.driverFactory(cb, opts.model, this.cwd);
    this.drivers.set(id, driver);
    driver.start();
  }

  sendMessage(id: string, text: string): void {
    this.drivers.get(id)?.send(text);
  }

  async setModel(id: string, model: string): Promise<void> {
    await this.drivers.get(id)?.setModel(model);
  }

  async interrupt(id: string): Promise<void> {
    await this.drivers.get(id)?.interrupt();
  }
}
