import { LocalPlayerData } from "../user/local-player-data";
import { Player } from "../player/player";
import { RunMode } from "./run-mode";
import { RunData } from "./run-data";
import { GameState } from "../player/game-state";
import { Task } from "./task";
import { Team } from "./team";
import { Timer } from "./timer";
import { PlayerState } from "../player/player-state";
import { GoalService } from "src/app/services/goal.service";
import { RunState } from "./run-state";
import { MultiLevel } from "./mutli-levels";

export class Run {
    data: RunData;
    teams: Team[];
    timer: Timer;

    constructor(runData: RunData) {
        this.data = runData;
        this.teams = [];
        this.timer = new Timer(15);

        for (let i = 0; i < this.data.teams; i++)
            this.teams.push(new Team("Team " + (i + 1)));
    }

    removePlayer(playerName: string): void {
        let team = this.getPlayerTeam(playerName);
        if (!team) return;
        team.players = team.players.filter(x => x.name !== playerName);
    }

    toggleVoteReset(playerName: string, state: PlayerState): boolean {
        let player = this.getPlayer(playerName);
        if (!player) return false;
        player.state = state;

        if (state === PlayerState.WantsToReset)
            return this.checkForRunReset();

        return false;
    }

    checkForRunReset(): boolean {
        let players = this.teams.flatMap(x => x.players);
        if (players.filter(x => x.state === PlayerState.WantsToReset).length / players.length <= 0.65)
            return false;
        
        this.timer.reset();
        this.teams.forEach(team => {
            team.tasks = [];
            team.players.forEach(player => {
                player.state = PlayerState.Neutral;
            })
        });
        return true;
    }

    endPlayerRun(playerName: string): void {
        let player = this.getPlayer(playerName);
        if (!player) return;
        player.state = PlayerState.Finished;
        if (this.everyoneHasFinished())
            this.timer.runState = RunState.Ended;
    }

    everyoneHasFinished(): boolean {
        return this.teams.every(x => x.players.every(y => y.state === PlayerState.Finished || y.state === PlayerState.Forfeit));
    }

    updateState(playerName: string, state: GameState): void {
        let player = this.getPlayer(playerName);
        if (!player) return;
        player.gameState = state;
    }

    addSplit(task: Task): void {
            this.getPlayerTeam(task.obtainedBy)?.tasks.unshift(task);
    }

    toggleReady(playerName: string, state: PlayerState): void {
        let player = this.getPlayer(playerName);
        if (!player) return;
        player.state = state;
    }

    everyoneIsReady(): boolean {
        return this.teams.every(x => x.players.every(y => y.state === PlayerState.Ready));
    }

    start(startDate: Date) {
        startDate.setSeconds(startDate.getSeconds() + this.timer.countdownSeconds - 1);
        this.timer.startTimer(startDate.getTime());
    }

    changeTeam(playerName: string, teamName: string) {
      let newTeam = this.getTeam(teamName);
      if (!newTeam) return;
  
      let oldTeam = this.teams.find(x => x.players.some(player => player.name === playerName));
      
  
      let player = oldTeam ? oldTeam.players.find(x => x.name === playerName) : new Player(playerName);
      newTeam.players.push(player!);
      //cheap method of forcing screen to re-render old team
      if (oldTeam) {
        let players = oldTeam.players.filter(x => x.name !== playerName);
        oldTeam.players = [];
        oldTeam.players = players;
      }
    }
    
    getTimerShortenedFormat(): string {
        let time = this.timer.time + this.timer.timeMs;
        for (let i = 0; i < 3 && (time.charAt(0) === "0" || time.charAt(0) === ":"); i++)
            time = time.substring(1);
        return time;
    }

    getTeam(teamName: string): Team | undefined {
        return this.teams.find(x => x.name === teamName);
    }

    getPlayerTeam(playerName: string): Team | undefined {
        return this.teams.find(x => x.players.some(player => player.name === playerName));
    }

    getPlayer(playerName: string): Player | undefined {
        return this.getPlayerTeam(playerName)?.players.find(x => x.name === playerName);
    }

    playerTeamHasCell(task: string, playerName: string): boolean {
        return this.getPlayerTeam(playerName)?.tasks.some(x => x.gameTask === task) ?? false;
    }

    runHasCell(task: string): boolean {
        return this.teams.some(x => x.tasks.some(y => y.gameTask === task));
    }


    // --- RUN METHODS INVOLVING OPENGOAL ---

    //used to sync runs between players for user join or in case of desync
    importChanges(localPlayer: LocalPlayerData, run: Run, goal: GoalService) {

        //handle run metedata
        if (this.timer.runState === RunState.Waiting)
            this.data = run.data;
        //handle timer
        if (this.timer.runState === RunState.Waiting && run.timer.runState === RunState.Countdown && run.timer.startDateMs) {
            this.timer.startTimer(run.timer.startDateMs);
            localPlayer.state = PlayerState.Neutral;
        }

        //handle team events
        this.teams.forEach(team => {
            let importTeam = run.teams.find(x => x.name === team.name);
            if (importTeam) {
                //checks to do before run start
                if (this.timer.runState === RunState.Waiting) {
                    team.owner = importTeam.owner;
                    team.players = importTeam.players;
                }
                //checks to do after run start
                else {
                    //get new player states
                    team.players.forEach(player => {
                        let importPlayer = importTeam!.players.find(x => x.name === player.name);
                        if (importPlayer) {
                            player.state = importPlayer.state;
                            player.gameState = importPlayer.gameState;
                        }
                    });

                    //localPlayer player class, use to check if this is curernt players TEAM
                    let localPlayerImportedPlayer = team.players.find(x => x.name === localPlayer.name);
                    //check for new tasks to give player
                    if (localPlayerImportedPlayer || this.data.mode === RunMode.CtC) {
                        importTeam.tasks.filter(x => !team.tasks.some(({ gameTask: task }) => task === x.gameTask)).forEach(task => {
                            this.giveCellToUser(goal, task, localPlayerImportedPlayer);
                        });
                    }

                    //transfer tasks
                    team.tasks = importTeam.tasks;

                    //state update checks
                    if (localPlayerImportedPlayer) {
                        this.onUserStateChange(goal, localPlayer, localPlayerImportedPlayer);
                    }
                }
            }
        });
    }

    giveCellToUser(goal: GoalService, task: Task, player: Player | undefined) {
        if (!player) return;

        if (task.gameTask !== "int-finalboss-movies" && (this.getPlayerTeam(task.obtainedBy)?.name === this.getPlayerTeam(player.name)?.name || this.data.mode === RunMode.CtC)) {
            if (player?.gameState.currentLevel.includes(task.gameTask.substring(0, task.gameTask.indexOf("-"))) || !player.gameState.currentLevel) {
                let fuelCell = Task.getEnameMap().get(task.gameTask);
                if (fuelCell) {
                    console.log("SENDING OG HIDE CELL!");
                    goal.runCommand('(+! (-> (the fuel-cell (process-by-ename "' + fuelCell + '")) base y) (meters -200.0))');
                }
            }
            console.log("SENDING OG CELL PICKUP!");
            goal.runCommand("(dm-give-cell (game-task " + task.gameTask + "))");
        }
    }

    onUserStateChange(goal: GoalService, localPlayer: LocalPlayerData, player: Player) {
        const team = this.getPlayerTeam(player.name);
        if (!team) return;

        let levelToCheck = team.players[0]?.gameState.currentLevel;
        //if all on same level hub zoomer
        if (!this.data.allowSoloHubZoomers) {
            if (!localPlayer.restrictedZoomerLevels.includes(player.gameState.currentLevel) || team.players.every(x => x.gameState.onZoomer && x.gameState.currentLevel === levelToCheck)) {
                console.log("ALLOW ZOOMER USE!");
                goal.runCommand("(set-zoomer-full-mode)");
                localPlayer.restrictedZoomerLevels = localPlayer.restrictedZoomerLevels.filter(x => x !== player!.gameState.currentLevel);
            }
            else {
                console.log("DISALLOW ZOOMER USE!");
                goal.runCommand("(set-zoomer-wait-mode)");
            }
        }
        if (this.data.requireSameLevel) {
            if (team.players.every(x => this.isSameLevel(x.gameState.currentLevel, levelToCheck))) {
                console.log("ALLOW CELL PICKUP!");
                goal.runCommand("(set! *allow-cell-pickup?* #t)");
            }
            else {
                console.log("DISALLOW CELL PICKUP!");
                goal.runCommand("(set! *allow-cell-pickup?* #f)");
            }
        }
    }

    private isSameLevel(currentLevel: string, checkAgainst: string) {
        if (MultiLevel.spiderCave().includes(currentLevel) && MultiLevel.spiderCave().includes(checkAgainst))
            return true;
        if (MultiLevel.jungle().includes(currentLevel) && MultiLevel.jungle().includes(checkAgainst))
            return true;
        if (MultiLevel.sunken().includes(currentLevel) && MultiLevel.sunken().includes(checkAgainst))
            return true;
        if (currentLevel === checkAgainst)
            return true;

        return false;
    }
}