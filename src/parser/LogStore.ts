import type {
  Plan,
  Event,
  ParseStats,
  Summary,
  MigrationType,
} from '../types';
import { PlanStatuses, MigrationTypes, phaseToStep } from './constants';
import { computePhaseLogSummaries, detectVMMigrationType, buildWarmInfoFromPhaseHistory } from './utils';

/**
 * LogStore manages parsed data during log file processing
 */
export class LogStore {
  private plans: Map<string, Plan> = new Map();
  private events: Event[] = [];
  private stats: ParseStats = {
    totalLines: 0,
    parsedLines: 0,
    errorLines: 0,
    duplicateLines: 0,
    plansFound: 0,
    vmsFound: 0,
  };
  private processedLines: Set<string> = new Set();

  /**
   * Check if a line has already been processed
   */
  isLineProcessed(line: string): boolean {
    return this.processedLines.has(line);
  }

  /**
   * Mark a line as processed
   */
  markLineProcessed(line: string): void {
    this.processedLines.add(line);
  }

  /**
   * Get or create a plan
   */
  getOrCreatePlan(namespace: string, name: string): Plan {
    const key = `${namespace}/${name}`;
    let plan = this.plans.get(key);
    
    if (!plan) {
      plan = {
        name,
        namespace,
        status: PlanStatuses.Pending,
        archived: false,
        migrationType: MigrationTypes.Unknown,
        conditions: [],
        vms: {},
        errors: [],
        panics: [],
        firstSeen: new Date(0),
        lastSeen: new Date(0),
      };
      this.plans.set(key, plan);
    }
    
    return plan;
  }

  /**
   * Find a plan by key (namespace/name)
   */
  findPlan(key: string): Plan | undefined {
    return this.plans.get(key);
  }

  /**
   * Get the most recent plan (by lastSeen)
   */
  getMostRecentPlan(): Plan | undefined {
    let mostRecent: Plan | undefined;
    for (const plan of this.plans.values()) {
      if (!mostRecent || plan.lastSeen > mostRecent.lastSeen) {
        mostRecent = plan;
      }
    }
    return mostRecent;
  }

  /**
   * Add an event to the timeline
   */
  addEvent(event: Event): void {
    this.events.push(event);
  }

  /**
   * Update stats
   */
  updateStats(partial: Partial<ParseStats>): void {
    Object.assign(this.stats, partial);
  }

  /**
   * Increment a stat counter
   */
  incrementStat(key: keyof ParseStats): void {
    this.stats[key]++;
  }

  /**
   * Get all plans with computed summaries
   */
  getAllPlans(): Plan[] {
    const plans: Plan[] = [];
    
    for (const plan of this.plans.values()) {
      // Compute phase log summaries and migration type for each VM
      for (const vm of Object.values(plan.vms)) {
        vm.phaseLogSummaries = computePhaseLogSummaries(vm);
        vm.migrationType = detectVMMigrationType(vm.phaseHistory) as MigrationType;
        
        const isWarm = vm.migrationType === MigrationTypes.Warm;
        if (vm.currentPhase) {
          vm.currentStep = phaseToStep(vm.currentPhase, isWarm);
        }
        
        // Build warmInfo from controller log phase history for warm VMs
        // (YAML-sourced VMs already have warmInfo set)
        if (isWarm && !vm.warmInfo) {
          const warmInfo = buildWarmInfoFromPhaseHistory(vm.phaseHistory);
          if (warmInfo) {
            vm.warmInfo = warmInfo;
            vm.precopyCount = warmInfo.precopies.length;
          }
        }

        // Update step info in phase history
        for (const ph of vm.phaseHistory) {
          ph.step = phaseToStep(ph.name, isWarm);
        }
      }
      
      // Detect plan migration type
      plan.migrationType = this.detectPlanMigrationType(plan) as MigrationType;
      plans.push(plan);
    }
    
    return plans;
  }

  /**
   * Detect plan migration type based on VMs
   */
  private detectPlanMigrationType(plan: Plan): string {
    let hasWarm = false;
    let hasCold = false;
    let hasOnlyConversion = false;

    for (const vm of Object.values(plan.vms)) {
      const vmType = detectVMMigrationType(vm.phaseHistory);
      switch (vmType) {
        case MigrationTypes.Warm:
          hasWarm = true;
          break;
        case MigrationTypes.Cold:
          hasCold = true;
          break;
        case MigrationTypes.OnlyConversion:
          hasOnlyConversion = true;
          break;
      }
    }

    if (hasWarm) return MigrationTypes.Warm;
    if (hasCold) return MigrationTypes.Cold;
    if (hasOnlyConversion) return MigrationTypes.OnlyConversion;
    return MigrationTypes.Unknown;
  }

  /**
   * Get events
   */
  getEvents(): Event[] {
    return this.events;
  }

  /**
   * Get summary
   */
  getSummary(): Summary {
    const summary: Summary = {
      totalPlans: this.plans.size,
      running: 0,
      succeeded: 0,
      failed: 0,
      archived: 0,
      pending: 0,
    };

    for (const plan of this.plans.values()) {
      if (plan.archived) {
        summary.archived++;
      }
      switch (plan.status) {
        case PlanStatuses.Running:
          summary.running++;
          break;
        case PlanStatuses.Succeeded:
          summary.succeeded++;
          break;
        case PlanStatuses.Failed:
          summary.failed++;
          break;
        case PlanStatuses.Pending:
        case PlanStatuses.Ready:
          summary.pending++;
          break;
      }
    }

    return summary;
  }

  /**
   * Get parse stats
   */
  getStats(): ParseStats {
    // Update plan and VM counts
    this.stats.plansFound = this.plans.size;
    let vmsFound = 0;
    for (const plan of this.plans.values()) {
      vmsFound += Object.keys(plan.vms).length;
    }
    this.stats.vmsFound = vmsFound;
    return this.stats;
  }

  /**
   * Get the complete parse result
   */
  getResult() {
    return {
      plans: this.getAllPlans(),
      events: this.events,
      summary: this.getSummary(),
      stats: this.getStats(),
      networkMaps: [],
      storageMaps: [],
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.plans.clear();
    this.events = [];
    this.stats = {
      totalLines: 0,
      parsedLines: 0,
      errorLines: 0,
      duplicateLines: 0,
      plansFound: 0,
      vmsFound: 0,
    };
    this.processedLines.clear();
  }
}
