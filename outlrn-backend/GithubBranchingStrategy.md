<p align="center">
  <img  width="400" height="300"  alt="img2-removebg-preview" src="https://github.com/user-attachments/assets/1f2cc7f7-3727-4f0a-be82-35ca37402ece" />
</p>
<br><br>

# GitHub Branching Strategy

<img width="6512" height="3849" alt="Outlrn-Branching-Strategy" src="https://github.com/user-attachments/assets/98b63a7d-74da-41b2-80ca-ac0367d12bb2" />


## 🌿 Branches Used
- `main` - The active developmement branch, all the feature and release branches are merged into this branch
- `feature/*` - Feature development branch
- `release/*` - Release branch - new branch for every new version release
- `bugfix/*` - For fixes in release branch after QA process
- `hotfix/*` - Production fixes

---

## 1️⃣ Main Branch (`main`)
- `main` is the single source of truth for development.
- Every new developer pulls the codebase from `main`.
- Features are continuously integrated into `main` after passing automated tests.
- `main` always contains the latest integrated development code.
- **Note:** `main` is NOT deployed directly - release branches are created from `main` for deployment.

---

## 2️⃣ Feature Branches (`feature/*`)
- Developers create a new branch from `main` for every feature.
- Naming convention example:
  - `feature/login`
  - `feature/navbar`
  - `feature/payment`

### 🔄 Workflow
1. Developer pulls latest code from `main`
2. Creates a `feature/*` branch from `main`
3. Implements the feature
4. Pushes changes to their feature branch and then creates a PR to `main` branch
5. **Automated tests run** (CI pipeline)
6. After tests pass, feature is merged into `main`
7. Feature branches are short-lived and deleted after merge

---

## 3️⃣ 📦 Release Branches (`release/*`)
- When `main` is ready for deployment, a **release branch** is created.
- Release branches are used for:
  - Final QA testing
  - Deployment to test and production environments
  - Bug fixes and stabilization

### 🏷️ Naming Convention
- Follows **[Semantic Versioning](https://www.geeksforgeeks.org/software-engineering/introduction-semantic-versioning/)**:
  - `release/0.0.0`
  - `release/0.1.0`
  - `release/1.0.0`

### 🔄 Workflow
1. Development happens via `feature/*` branches → merged into `main`
2. When ready to release, create `release/vx.y.z` from `main`
3. Release branch undergoes QA process
4. Deploy release branch to **test server** (Docker: `test-v0.0.0`)
5. After testing, deploy release branch to **production** (Docker: `prod-v0.0.0`)
6. Tag the production-ready code: `git tag v0.0.0`
7. **CRITICAL:** After production is stable, merge `release/*` back to `main`

---

## 4️⃣ 🧪 Testing & Deployment Flow

### Test Environment
- Release branches are deployed to test server for QA validation
- Docker tag example: `test-v0.0.0`

### Production Environment  
- After successful testing, the same release branch is deployed to production
- Docker tag example: `prod-v0.0.0`
- Production code is tagged with version: `git tag v0.0.1`

### 🔄 Complete Flow
```
feature/* → main → release/vx.y.z → test → production → merge back to main
```

---

## 5️⃣ 🚑 Hotfix Branches (`hotfix/*`, `bugfix/*`)
- If a bug is discovered in the release branch (during testing or in production):
  - Create a `hotfix/*` or `bugfix/*` branch **from the release branch**

### 🏷️ Naming Convention
- `hotfix/auth-context`
- `bugfix/login-error`
- `hotfix/payment-crash`

### 🔄 Workflow
1. Bug found in `release/0.0.0` (either in test or production)
2. Create `hotfix/loading-issue` **from `release/0.0.0`** (NOT from main)
3. Fix the issue in the hotfix branch
4. Merge hotfix back into `release/0.0.0`
5. Re-deploy the updated release branch
6. After production is stable, merge `release/0.0.0` (with all hotfixes) back to `main`


## 6️⃣ 🆕 New Version Release Flow

### For the next release:
1. Developers continue creating `feature/*` branches from `main`
2. Features merge to `main` after automated tests pass
3. When ready for next release:
   - Create new release branch `release/0.1.0` from `main`
4. Follow the same testing and deployment process
5. Deploy new release to production
6. **Merge release branch back to `main`** after production is stable

---

## 7️⃣ 🔄 The Critical Merge-Back Step

### ⚠️ ALWAYS Merge Release to Main
After every production deployment:
1. Verify production is stable
2. **Merge the release branch back to `main`**
3. This ensures:
   - All hotfixes reach `main`
   - Next release includes all production fixes
   - `main` stays in sync with production

### Why This Matters
- **Without merge-back:** Hotfixes are lost in the next release
- **With merge-back:** All changes flow correctly through the system

---

## 📊 Branch Lifecycle Summary

| Branch Type | Created From | Merged To | Lifespan | Purpose |
|-------------|--------------|-----------|----------|---------|
| `feature/*` | `main` | `main` | Short (days) | Develop features |
| `release/*` | `main` | Back to `main` | Medium (weeks) | Stabilize & deploy |
| `bugfix/*` | `release` | `release` | Short (days) | Fix release bugs (after QA process) |
| `hotfix/*` | `release/*` | `release/*` | Very short (hours) | Fix release bugs (in production) |


---



**Last Updated:** [15-02-2026]  
**Maintained By:** [DevOps Team - Amith]
