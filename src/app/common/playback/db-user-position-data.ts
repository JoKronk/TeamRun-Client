import { Timer } from "../run/timer";
import { PositionDataTimestamp } from "./position-data";

export class DbUserPositionData {
    id: string = crypto.randomUUID();
    userId: string;
    playback: PositionDataTimestamp[] = [];

    timeFrontend?: string;
    nameFrontend?: string;

    constructor(userId: string) {
        this.userId = userId;
    }

    fillFrontendValues(name: string) {
        this.nameFrontend = name;
        this.timeFrontend = this.playback.length === 0 ? "0s" : Timer.msToTimeFormat(this.playback[0].time, true, true);
    }

    clean() {
        this.timeFrontend = undefined;
        this.nameFrontend = undefined;
    }
}