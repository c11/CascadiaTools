# Bounded job/report smoke, never a recovery or convergence acceptance run.
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 1) stop("Usage: bayesian_smoke.R <scientific-smoke-output>")
root <- normalizePath(args[1], mustWork = TRUE)
baseline <- NULL
for (host in c("claude", "opencode", "hermes")) {
  project <- file.path(root, paste(host, "project"))
  installed <- file.path(project, host)
  toolkit <- if (host == "claude") installed else file.path(installed, "toolkit")
  if (!file.exists(file.path(project, "results/glm_report.html")))
    stop("Run the GLM pilot first: ", project)
  fixture <- file.path(project, "bayesian-smoke")
  if (file.exists(fixture)) stop("Bayesian fixture already exists: ", fixture)
  dir.create(fixture)
  config <- file.path(fixture, "config.yaml")
  yaml::write_yaml(list(
    design = list(n_sites = 40, n_surveys = 3, prop_missing = 0),
    settings = list(engine = "nimble", seed = 417, niter = 2500, nburnin = 500,
      nchains = 3, thin = 1, gof_ndraws = 10, n_prop_draws = 100)), config)
  log <- file.path(fixture, "job.log")
  old <- setwd(project)
  status <- tryCatch(system2("bash", vapply(c(file.path(toolkit, "scripts/ejob"),
    "-c", "1", "-l", log, "--", file.path(toolkit, "scripts/Rscript"),
    file.path(toolkit, "core/run.R"), "selftest", "occu-single", "--config", config,
    "--nsim", "4", "--cores", "1", "--seed", "417", "--out", file.path(fixture, "results")), shQuote, ""),
    env = paste0("CASCADIATOOLS_ROOT=", shQuote(toolkit)),
    stdout = file.path(fixture, "launcher.log"), stderr = file.path(fixture, "launcher.log")),
    finally = setwd(old))
  if (status != 0) stop(host, " job failed; inspect ", log)
  recovery <- readRDS(file.path(fixture, "results/occu-single_selftest_recovery.rds"))
  stopifnot(nrow(recovery$reps) > 0, all(is.na(recovery$reps$error)),
            all(is.finite(recovery$reps$estimate)))
  numeric <- recovery$reps[c("param", "estimate", "sd", "lower", "upper", "truth", "seed")]
  if (is.null(baseline)) baseline <- numeric else
    stopifnot(isTRUE(all.equal(baseline, numeric, tolerance = 1e-10)))
  stopifnot(file.info(file.path(fixture, "results/occu-single_selftest_report.html"))$size > 1000)
  cat(host, ": local ejob/Nimble chains and report retrieval passed; acceptance OPEN\n")
}
cat("Three hosts agree within 1e-10; four replicates/short chains do not establish acceptance.\n")
