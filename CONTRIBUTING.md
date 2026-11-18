# Contributing to Stickify

Thanks for wanting to help! Contributions of all sizes are welcome: bug fixes, features, docs, and design tweaks.

## How changes get in

Every change goes through a pull request, and **every pull request needs the maintainer's approval before it's merged**. Nobody pushes directly to `main`.

1. **Open an issue first** for anything bigger than a small fix, so we can agree on the approach before you spend time on it.
2. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b fix/short-description
   ```
3. **Make your change** and add or update tests where it makes sense.
4. **Run the checks locally** (see below).
5. **Open a pull request** and fill in the template.
6. **Review:** the maintainer reviews it, may ask for changes, and merges it once it's approved and CI is green.

## Running the project

You need Java 21, Maven and ffmpeg.

```bash
# Backend tests and build
cd backend
mvn verify

# Run the API locally on http://localhost:8080
mvn spring-boot:run

# Serve the frontend on http://localhost:5500
cd ../frontend
python3 -m http.server 5500
```

## Guidelines

**Backend (Java / Spring Boot)**
- Keep the layers separate: controllers handle HTTP, services hold logic, models are immutable records.
- Throw one of the `StickerException` subclasses for errors users should see, with a plain, friendly message.
- Don't add dependencies without discussing it in an issue first.
- New logic should come with tests.

**Frontend**
- Plain HTML, CSS and JavaScript, with no build step and no frameworks.
- It must work on a phone screen and in both light and dark mode.

**Commits and pull requests**
- One topic per pull request; small pull requests get reviewed faster.
- Write clear commit messages in the imperative: `Add retry when X lookup times out`.
- Link the issue your pull request addresses (`Closes #12`).

## Reporting bugs and ideas

Use the issue templates on GitHub. For security problems, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

By submitting a contribution, you agree that it is licensed under the [Apache License 2.0](LICENSE), the same license as the project (see section 5 of the license).

## Code of conduct

Please follow our [Code of Conduct](CODE_OF_CONDUCT.md) in all project spaces.
