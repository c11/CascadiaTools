# Execution smoke only: does not replace recovery or convergence acceptance.
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2) stop("Usage: scientific_smoke.R <built-packages> <new-output-directory>")
packages <- normalizePath(args[1], mustWork = TRUE)
output <- args[2]
if (file.exists(output)) stop("Output already exists; choose a fresh fixture directory")
dir.create(output, recursive = TRUE)
output <- normalizePath(output)
if (!requireNamespace("yaml", quietly = TRUE)) stop("Install yaml in the test R library")
baseline <- NULL
for (host in c("claude", "opencode", "hermes")) {
  project <- file.path(output, paste(host, "project"))
  dir.create(project)
  source <- file.path(packages, host)
  if (!file.copy(source, project, recursive = TRUE)) stop("Package copy failed: ", host)
  installed <- file.path(project, host)
  toolkit <- if (host == "claude") installed else file.path(installed, "toolkit")
  run_cli <- function(command) {
    log <- file.path(project, paste0(command[1], ".log"))
    old <- setwd(project)
    on.exit(setwd(old))
    status <- system2("bash", vapply(c(file.path(toolkit, "scripts/Rscript"),
      file.path(toolkit, "core/run.R"), command), shQuote, ""),
      env = paste0("CASCADIATOOLS_ROOT=", shQuote(toolkit)), stdout = log, stderr = log)
    if (status != 0) stop(host, " command failed; inspect ", log)
  }
  simulation <- file.path(project, "simulation.yaml")
  yaml::write_yaml(list(design = list(family = "poisson", n_groups = 0, n = 150),
    settings = list(engine = "glm", diagnostics = FALSE, n_draws = 200, seed = 417)), simulation)
  run_cli(c("simulate", "glm", "--config", simulation, "--seed", "417", "--out", "simulation"))
  sim <- readRDS(file.path(project, "simulation/glm_sim_seed417.rds"))
  dir.create(file.path(project, "data_raw"))
  csv <- file.path(project, "data_raw/synthetic.csv")
  utils::write.csv(sim$data$df, csv, row.names = FALSE)
  data <- sim$data$spec
  data$file <- csv
  config <- file.path(project, "fit.yaml")
  yaml::write_yaml(list(data = data,
    settings = list(engine = "glm", diagnostics = FALSE, n_draws = 200, seed = 417),
    figures = list(formats = "png", dpi = 72)), config)
  run_cli(c("fit", "glm", "--config", config, "--out", "results"))
  estimates <- utils::read.csv(file.path(project, "results/glm_estimates.csv"))
  stopifnot(all(is.finite(estimates$estimate)))
  if (is.null(baseline)) baseline <- estimates else
    stopifnot(isTRUE(all.equal(baseline, estimates, tolerance = 1e-10)))
  report <- file.path(project, "results/glm_report.html")
  stopifnot(file.info(report)$size > 1000)
  run_cli(c("selftest", "glm", "--config", simulation, "--nsim", "4", "--cores", "1",
            "--seed", "417", "--out", "selftest"))
  stopifnot(file.info(file.path(project, "selftest/glm_selftest_report.html"))$size > 1000)
  cat(host, ": synthetic GLM fit/report and four-replicate execution smoke passed\n")
}
cat("Cross-host estimates agree within 1e-10. Scientific acceptance remains OPEN.\n")
